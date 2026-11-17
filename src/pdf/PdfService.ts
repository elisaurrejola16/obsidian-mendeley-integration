import { App, TFile, normalizePath } from "obsidian";
import type { MendeleyClient } from "../api/MendeleyClient";
import { listFilesForDocument } from "../api/endpoints";
import { sanitizeNoteName } from "../templates/fileName";
import { getErrorMessage } from "../utils/errors";
import { ensureFolderExists } from "../utils/folders";
import { buildPdfBlockBody, upsertPdfBlock } from "./PdfBlock";
import { looksLikePdf, pickPdfFile } from "./pdfFile";

export interface NoteIds {
  mendeleyId: string;
  citekey: string;
}

export interface PdfDownloadDeps {
  app: App;
  client: MendeleyClient;
  pdfFolder: string;
}

/** Returns the Mendeley identifiers stored in a synced note's frontmatter, or null if it is not one. */
export function getNoteIds(app: App, note: TFile): NoteIds | null {
  const frontmatter = app.metadataCache.getFileCache(note)?.frontmatter as
    | Record<string, unknown>
    | undefined;
  const mendeleyId = frontmatter?.mendeley_id;
  const citekey = frontmatter?.citekey;
  if (typeof mendeleyId !== "string" || typeof citekey !== "string") return null;
  return { mendeleyId, citekey };
}

/** Finds the PDF embedded in a note, wherever the user may have moved it since. */
export function findEmbeddedPdf(app: App, note: TFile): TFile | null {
  const embeds = app.metadataCache.getFileCache(note)?.embeds ?? [];
  for (const embed of embeds) {
    const linkpath = embed.link.split("#")[0];
    if (!linkpath.toLowerCase().endsWith(".pdf")) continue;
    const target = app.metadataCache.getFirstLinkpathDest(linkpath, note.path);
    if (target) return target;
  }
  return null;
}

/**
 * Downloads the PDF attached to the note's Mendeley document into the vault
 * and embeds it in the note. Idempotent: if the note already embeds a PDF (or
 * the file is already in the PDF folder) nothing is downloaded again.
 */
export async function downloadPdfForNote(
  deps: PdfDownloadDeps,
  note: TFile
): Promise<{ file: TFile; downloaded: boolean }> {
  const { app, client, pdfFolder } = deps;

  const ids = getNoteIds(app, note);
  if (!ids) {
    throw new Error(
      "This note has no mendeley_id/citekey in its frontmatter, so it cannot be matched to a Mendeley document."
    );
  }

  const existing = findEmbeddedPdf(app, note);
  if (existing) return { file: existing, downloaded: false };

  const path = normalizePath(`${pdfFolder}/${sanitizeNoteName(note.basename)}.pdf`);
  const atPath = app.vault.getAbstractFileByPath(path);
  let pdfFile: TFile;
  let downloaded = false;

  if (atPath instanceof TFile) {
    pdfFile = atPath;
  } else {
    const files = await step("Looking up the attached files", () =>
      listFilesForDocument(client, ids.mendeleyId)
    );
    const pdf = pickPdfFile(files);
    if (!pdf) throw new Error("This reference has no PDF attached in Mendeley.");

    const data = await step("Downloading the file", () =>
      client.downloadFile(pdf.id)
    );
    if (!looksLikePdf(data)) {
      throw new Error("Mendeley returned something that is not a PDF file.");
    }
    await ensureFolderExists(app, pdfFolder);
    pdfFile = await app.vault.createBinary(path, data);
    downloaded = true;
  }

  const linkText = app.metadataCache.fileToLinktext(pdfFile, note.path);
  await app.vault.process(note, (content) =>
    upsertPdfBlock(content, buildPdfBlockBody({ kind: "embed", linkText }))
  );
  return { file: pdfFile, downloaded };
}

/** Prefixes an error with the step that failed, so a bare "HTTP 400" says where it came from. */
async function step<T>(label: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw new Error(`${label} failed. ${getErrorMessage(err)}`);
  }
}
