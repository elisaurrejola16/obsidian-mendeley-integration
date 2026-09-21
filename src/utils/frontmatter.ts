import { parseYaml, stringifyYaml } from "obsidian";

const FRONTMATTER_REGEX = /^---\n([\s\S]*?)\n---\n?/;

export interface ParsedNote {
  frontmatter: Record<string, unknown>;
  body: string;
}

/** Thin I/O wrapper over Obsidian's parseYaml/stringifyYaml; the mapping logic lives in templates/frontmatterMapping.ts (no "obsidian" dependency, so it can be unit-tested). */
export function parseNoteContent(content: string): ParsedNote {
  const match = content.match(FRONTMATTER_REGEX);
  if (!match) {
    return { frontmatter: {}, body: content };
  }
  const frontmatter = (parseYaml(match[1]) as Record<string, unknown>) ?? {};
  const body = content.slice(match[0].length);
  return { frontmatter, body };
}

export function serializeNoteContent(
  frontmatter: Record<string, unknown>,
  body: string
): string {
  const yaml = (stringifyYaml(frontmatter) as string).trimEnd();
  return `---\n${yaml}\n---\n\n${body.trimStart()}`;
}
