import { App, TFile, normalizePath } from "obsidian";
import { MendeleyClient } from "../api/MendeleyClient";
import {
  listAllDocuments,
  listAllFolders,
  listFolderDocumentIds,
} from "../api/endpoints";
import type { MendeleyFolder } from "../api/types";
import { resolveCitekey } from "../citekey/CitekeyGenerator";
import {
  mapDocumentToFrontmatter,
  mergeFrontmatter,
  NoteFrontmatter,
} from "../templates/frontmatterMapping";
import { buildNoteFileName } from "../templates/fileName";
import { parseNoteContent, serializeNoteContent } from "../utils/frontmatter";
import { buildNoteBody } from "../templates/NoteTemplate";
import { buildFolderPaths, pickPrimaryFolderPath } from "./FolderHierarchy";
import type { SyncStateData } from "./SyncState";
import { getErrorMessage } from "../utils/errors";
import { ensureFolderExists } from "../utils/folders";
import { buildPdfBlockBody, hasPdfBlock, upsertPdfBlock } from "../pdf/PdfBlock";

export interface SyncResult {
  created: number;
  updated: number;
  errors: string[];
}

export interface SyncDependencies {
  app: App;
  client: MendeleyClient;
  targetFolder: string;
  fileNameTemplate: string;
  noteTemplate: string;
  syncState: SyncStateData;
  saveSyncState: (state: SyncStateData) => Promise<void>;
}

interface ExistingNote {
  file: TFile;
  citekey: string;
}

interface ExistingNotes {
  byMendeleyId: Map<string, ExistingNote>;
  citekeys: Set<string>;
}

/**
 * Incrementally syncs (modified_since) the Mendeley library into vault notes.
 * Notes are identified by the mendeley_id in their frontmatter, never by file
 * name or location, so the user can rename or move them freely. Existing notes
 * are only updated in place (their managed block and managed frontmatter keys);
 * only new notes get a folder (mirroring Mendeley's) and a generated file name.
 * Never deletes notes.
 */
export async function syncLibrary(deps: SyncDependencies): Promise<SyncResult> {
  const { app, client, targetFolder, noteTemplate, syncState } = deps;
  const result: SyncResult = { created: 0, updated: 0, errors: [] };

  await ensureFolderExists(app, targetFolder);

  const existing = collectExistingNotes(app);
  const existingCitekeys = existing.citekeys;

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
        const known = existing.byMendeleyId.get(doc.id);
        const citekey = resolveCitekey(doc, known?.citekey, existingCitekeys);
        existingCitekeys.add(citekey);

        const memberFolders = folderMembership.get(doc.id) ?? [];
        const folderNames = memberFolders.map((f) => f.name);
        const primaryFolderPath = pickPrimaryFolderPath(
          memberFolders.map((f) => f.id),
          folderPathsById
        );

        const frontmatter = mapDocumentToFrontmatter(doc, citekey, folderNames);
        const wasCreated = await writeNoteForDocument({
          app,
          targetFolder,
          primaryFolderPath,
          fileNameTemplate: deps.fileNameTemplate,
          template: noteTemplate,
          frontmatter,
          known,
          hasPdf: doc.file_attached === true,
        });
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

/**
 * Finds already-synced notes anywhere in the vault. If several notes share a
 * mendeley_id (e.g. duplicates from older versions) the oldest one wins, so
 * sync keeps updating the original and never the later copies.
 */
function collectExistingNotes(app: App): ExistingNotes {
  const byMendeleyId = new Map<string, ExistingNote>();
  const citekeys = new Set<string>();
  for (const file of app.vault.getMarkdownFiles()) {
    const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter as
      | Record<string, unknown>
      | undefined;
    const citekey = frontmatter?.citekey;
    const mendeleyId = frontmatter?.mendeley_id;
    if (typeof citekey !== "string") continue;
    citekeys.add(citekey);
    if (typeof mendeleyId !== "string") continue;
    const current = byMendeleyId.get(mendeleyId);
    if (!current || file.stat.ctime < current.file.stat.ctime) {
      byMendeleyId.set(mendeleyId, { file, citekey });
    }
  }
  return { byMendeleyId, citekeys };
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

interface WriteNoteParams {
  app: App;
  targetFolder: string;
  primaryFolderPath: string | null;
  fileNameTemplate: string;
  template: string;
  frontmatter: NoteFrontmatter;
  known: ExistingNote | undefined;
  hasPdf: boolean;
}

async function writeNoteForDocument(params: WriteNoteParams): Promise<boolean> {
  const { app, template, frontmatter, known, hasPdf } = params;

  if (known) {
    const raw = await app.vault.read(known.file);
    const { frontmatter: existingFm, body } = parseNoteContent(raw);
    const mergedFm = mergeFrontmatter(existingFm, frontmatter);
    const newBody = withPdfButton(buildNoteBody(body, template, frontmatter), hasPdf);
    const newContent = serializeNoteContent(mergedFm, newBody);
    if (newContent !== raw) {
      await app.vault.modify(known.file, newContent);
    }
    return false;
  }

  const folderPath = normalizePath(
    params.primaryFolderPath
      ? `${params.targetFolder}/${params.primaryFolderPath}`
      : params.targetFolder
  );
  await ensureFolderExists(app, folderPath);
  const path = uniqueNotePath(
    app,
    folderPath,
    buildNoteFileName(params.fileNameTemplate, frontmatter)
  );

  const mergedFm = mergeFrontmatter({}, frontmatter);
  const newBody = withPdfButton(buildNoteBody("", template, frontmatter), hasPdf);
  await app.vault.create(path, serializeNoteContent(mergedFm, newBody));
  return true;
}

/** Never overwrites an unrelated file that happens to have the same name. */
function uniqueNotePath(app: App, folderPath: string, baseName: string): string {
  let path = normalizePath(`${folderPath}/${baseName}.md`);
  for (let n = 2; app.vault.getAbstractFileByPath(path); n++) {
    path = normalizePath(`${folderPath}/${baseName} (${n}).md`);
  }
  return path;
}

/** Adds the "Download PDF" button block to notes whose reference has a PDF, only if the note has no PDF block yet. */
function withPdfButton(body: string, hasPdf: boolean): string {
  if (!hasPdf || hasPdfBlock(body)) return body;
  return upsertPdfBlock(body, buildPdfBlockBody({ kind: "button" }));
}
