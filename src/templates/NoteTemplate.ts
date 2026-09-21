import { replaceManagedBlock } from "../sync/DelimitedBlocks";
import type { NoteFrontmatter } from "./frontmatterMapping";

const PLACEHOLDER_REGEX = /{{\s*(\w+)\s*}}/g;

export function renderTemplate(
  template: string,
  frontmatter: NoteFrontmatter
): string {
  return template.replace(PLACEHOLDER_REGEX, (_match, key: string) => {
    const value = (frontmatter as unknown as Record<string, unknown>)[key];
    if (Array.isArray(value)) return value.join(", ");
    if (value === null || value === undefined) return "";
    return String(value);
  });
}

/**
 * Builds the full note body. Template-derived content lives inside the
 * managed block (see DelimitedBlocks); the first time a note is created, a
 * free-form "## My notes" section is also added outside the block so the
 * user can write there without ever risking being overwritten.
 */
export function buildNoteBody(
  existingBody: string,
  template: string,
  frontmatter: NoteFrontmatter
): string {
  const rendered = renderTemplate(template, frontmatter);
  const isNewNote = existingBody.trim().length === 0;
  const updated = replaceManagedBlock(existingBody, rendered);
  return isNewNote ? `${updated}\n\n## My notes\n\n` : updated;
}
