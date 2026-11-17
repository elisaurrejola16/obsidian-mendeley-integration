import type { NoteFrontmatter } from "./frontmatterMapping";

const MAX_LENGTH = 150;

/** Makes a string safe as a note file name and as a [[wikilink]] target. */
export function sanitizeNoteName(name: string): string {
  return name
    .replace(/\s*:\s*/g, " - ")
    .replace(/[\\/|]/g, "-")
    .replace(/[*?"<>#^[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+|\.+$/g, "")
    .slice(0, MAX_LENGTH)
    .trim();
}

/** Renders the file name (without extension) for a NEW note; existing notes are never renamed. */
export function buildNoteFileName(
  template: string,
  frontmatter: NoteFrontmatter
): string {
  const values: Record<string, string> = {
    citekey: frontmatter.citekey,
    title: frontmatter.title,
    year: frontmatter.year ? String(frontmatter.year) : "",
    author: frontmatter.authors[0]?.split(",")[0]?.trim() ?? "",
  };
  const rendered = template.replace(
    /{{\s*(\w+)\s*}}/g,
    (_match, key: string) => values[key] ?? ""
  );
  return (
    sanitizeNoteName(rendered) ||
    sanitizeNoteName(frontmatter.citekey) ||
    "Untitled"
  );
}
