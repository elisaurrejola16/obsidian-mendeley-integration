import { App, TFile, normalizePath } from "obsidian";
import { MendeleyClient } from "../api/MendeleyClient";
import {
  listAllDocuments,
  listAllFolders,
  listFolderDocumentIds,
} from "../api/endpoints";
import type { MendeleyFolder } from "../api/types";
import { generateCitekey } from "../citekey/CitekeyGenerator";
import {
  mapDocumentToFrontmatter,
  mergeFrontmatter,
  NoteFrontmatter,
} from "../templates/frontmatterMapping";
import { parseNoteContent, serializeNoteContent } from "../utils/frontmatter";
import { buildNoteBody } from "../templates/NoteTemplate";
import {
  buildFolderPaths,
  pickPrimaryFolderPath,
  sanitizePathSegment,
} from "./FolderHierarchy";
import type { SyncStateData } from "./SyncState";
import { getErrorMessage } from "../utils/errors";

export interface SyncResult {
  created: number;
  updated: number;
  errors: string[];
}

export interface SyncDependencies {
  app: App;
  client: MendeleyClient;
  targetFolder: string;
  noteTemplate: string;
  syncState: SyncStateData;
  saveSyncState: (state: SyncStateData) => Promise<void>;
}

/**
 * Incrementally syncs (modified_since) the Mendeley library into vault
 * notes, mirroring Mendeley's folder hierarchy as subfolders inside
 * targetFolder. Never deletes notes: if a document is removed in Mendeley,
 * the local note simply stops being updated (see README, known Phase 1
 * limitation).
 */
export async function syncLibrary(deps: SyncDependencies): Promise<SyncResult> {
  const { app, client, targetFolder, noteTemplate, syncState } = deps;
  const result: SyncResult = { created: 0, updated: 0, errors: [] };

  await ensureFolderExists(app, targetFolder);

  const existingNotesByCitekey = collectExistingNotes(app, targetFolder);
  const existingCitekeys = new Set(existingNotesByCitekey.keys());

  const folders = await fetchAllFolders(client);
  const folderPathsById = buildFolderPaths(folders);
  const folderMembership = await buildFolderMembership(client, folders);

  const runStartedAt = new Date().toISOString();
  let newestModified = syncState.lastModifiedSince;

  for await (const page of listAllDocuments(client, {
    modifiedSince: syncState.lastModifiedSince ?? undefined,
  })) {
    for (const doc of page) {
      try {
        const citekey = generateCitekey(doc, existingCitekeys);
        existingCitekeys.add(citekey);

        const memberFolders = folderMembership.get(doc.id) ?? [];
        const folderNames = memberFolders.map((f) => f.name);
        const primaryFolderPath = pickPrimaryFolderPath(
          memberFolders.map((f) => f.id),
          folderPathsById
        );

        const frontmatter = mapDocumentToFrontmatter(doc, citekey, folderNames);
        const wasCreated = await writeNoteForDocument(
          app,
          targetFolder,
          primaryFolderPath,
          noteTemplate,
          frontmatter,
          existingNotesByCitekey
        );
        if (wasCreated) result.created++;
        else result.updated++;

        if (
          doc.last_modified &&
          (!newestModified || doc.last_modified > newestModified)
        ) {
          newestModified = doc.last_modified;
        }
      } catch (err) {
        result.errors.push(`${doc.title ?? doc.id}: ${getErrorMessage(err)}`);
      }
    }
  }

  await deps.saveSyncState({
    lastModifiedSince: newestModified ?? runStartedAt,
    lastSyncedAt: runStartedAt,
  });
  return result;
}

async function ensureFolderExists(app: App, folder: string): Promise<void> {
  const normalized = normalizePath(folder);
  if (!normalized || app.vault.getAbstractFileByPath(normalized)) return;
  const parentPath = normalized.split("/").slice(0, -1).join("/");
  if (parentPath) await ensureFolderExists(app, parentPath);
  if (!app.vault.getAbstractFileByPath(normalized)) {
    await app.vault.createFolder(normalized).catch(() => undefined);
  }
}

/** Walks targetFolder (and all its subfolders) looking for already-synced notes, indexed by citekey. */
function collectExistingNotes(app: App, folder: string): Map<string, TFile> {
  const normalized = normalizePath(folder);
  const notes = new Map<string, TFile>();
  for (const file of app.vault.getMarkdownFiles()) {
    if (!file.path.startsWith(normalized)) continue;
    const citekey = app.metadataCache.getFileCache(file)?.frontmatter?.citekey;
    if (typeof citekey === "string") notes.set(citekey, file);
  }
  return notes;
}

async function fetchAllFolders(client: MendeleyClient): Promise<MendeleyFolder[]> {
  const all: MendeleyFolder[] = [];
  for await (const page of listAllFolders(client)) all.push(...page);
  return all;
}

/**
 * The Mendeley API doesn't expose a document's folders on /documents; the
 * reverse map has to be built by walking /folders/{id}/documents.
 */
async function buildFolderMembership(
  client: MendeleyClient,
  folders: MendeleyFolder[]
): Promise<Map<string, MendeleyFolder[]>> {
  const membership = new Map<string, MendeleyFolder[]>();
  for (const folder of folders) {
    try {
      for await (const page of listFolderDocumentIds(client, folder.id)) {
        for (const { id } of page) {
          const list = membership.get(id) ?? [];
          list.push(folder);
          membership.set(id, list);
        }
      }
    } catch {
      // If one folder fails, keep going with the rest: it's not critical to
      // the note's content and shouldn't abort the whole sync.
    }
  }
  return membership;
}

async function writeNoteForDocument(
  app: App,
  targetFolder: string,
  primaryFolderPath: string | null,
  template: string,
  frontmatter: NoteFrontmatter,
  existingNotesByCitekey: Map<string, TFile>
): Promise<boolean> {
  const folderPath = normalizePath(
    primaryFolderPath ? `${targetFolder}/${primaryFolderPath}` : targetFolder
  );
  const desiredPath = normalizePath(
    `${folderPath}/${sanitizePathSegment(frontmatter.citekey)}.md`
  );

  const existingFile = existingNotesByCitekey.get(frontmatter.citekey);

  if (existingFile instanceof TFile) {
    if (existingFile.path !== desiredPath) {
      await ensureFolderExists(app, folderPath);
      // renameFile (instead of vault.rename) also updates internal links
      // elsewhere in the vault that point to this note.
      await app.fileManager.renameFile(existingFile, desiredPath);
    }
    const raw = await app.vault.read(existingFile);
    const { frontmatter: existingFm, body } = parseNoteContent(raw);
    const mergedFm = mergeFrontmatter(existingFm, frontmatter);
    const newBody = buildNoteBody(body, template, frontmatter);
    const newContent = serializeNoteContent(mergedFm, newBody);
    if (newContent !== raw) {
      await app.vault.modify(existingFile, newContent);
    }
    return false;
  }

  await ensureFolderExists(app, folderPath);
  const mergedFm = mergeFrontmatter({}, frontmatter);
  const newBody = buildNoteBody("", template, frontmatter);
  const newContent = serializeNoteContent(mergedFm, newBody);
  await app.vault.create(desiredPath, newContent);
  return true;
}
