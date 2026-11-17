import { MENDELEY_BLOCK_MARKERS } from "../sync/DelimitedBlocks";

const START_MARKER = "<!-- mendeley-pdf:start -->";
const END_MARKER = "<!-- mendeley-pdf:end -->";

export type PdfBlockState = { kind: "button" } | { kind: "embed"; linkText: string };

export function buildPdfBlockBody(state: PdfBlockState): string {
  if (state.kind === "button") {
    return "## PDF\n\n```mendeley-pdf\ndownload\n```";
  }
  return `## PDF\n\n![[${state.linkText}#height=600]]`;
}

export function hasPdfBlock(content: string): boolean {
  const start = content.indexOf(START_MARKER);
  return start !== -1 && content.indexOf(END_MARKER, start) !== -1;
}

/**
 * Own delimited block, independent from the main managed block: sync never
 * rewrites it once it exists, so a downloaded/embedded PDF (or one the user
 * moved or re-linked) is never reset. When absent it is inserted right after
 * the main managed block, or appended if that block is missing.
 */
export function upsertPdfBlock(content: string, body: string): string {
  const block = `${START_MARKER}\n${body.trim()}\n${END_MARKER}`;

  const start = content.indexOf(START_MARKER);
  const end = start === -1 ? -1 : content.indexOf(END_MARKER, start);
  if (start !== -1 && end !== -1) {
    return `${content.slice(0, start)}${block}${content.slice(end + END_MARKER.length)}`;
  }

  const mainEnd = content.indexOf(MENDELEY_BLOCK_MARKERS.END_MARKER);
  if (mainEnd !== -1) {
    const at = mainEnd + MENDELEY_BLOCK_MARKERS.END_MARKER.length;
    return `${content.slice(0, at)}\n\n${block}${content.slice(at)}`;
  }

  if (content.length === 0) return `${block}\n`;
  return `${content.replace(/\n*$/, "\n\n")}${block}\n`;
}
