import type { MendeleyDocument, MendeleyPersonName } from "../api/types";

export interface NoteFrontmatter {
  citekey: string;
  title: string;
  authors: string[];
  year: number | null;
  journal: string | null;
  doi: string | null;
  url: string | null;
  abstract: string | null;
  tags: string[];
  mendeley_folders: string[];
  mendeley_id: string;
  mendeley_modified: string | null;
}

/** Keys the plugin owns on every sync; any other key the user adds to the frontmatter is preserved. */
const MANAGED_KEYS: (keyof NoteFrontmatter)[] = [
  "citekey",
  "title",
  "authors",
  "year",
  "journal",
  "doi",
  "url",
  "abstract",
  "tags",
  "mendeley_folders",
  "mendeley_id",
  "mendeley_modified",
];

export function mapDocumentToFrontmatter(
  doc: MendeleyDocument,
  citekey: string,
  folderNames: string[]
): NoteFrontmatter {
  return {
    citekey,
    title: doc.title ?? "Untitled",
    authors: (doc.authors ?? []).map(formatAuthorName),
    year: doc.year ?? null,
    journal: doc.source ?? null,
    doi: doc.identifiers?.doi ?? null,
    url: doc.websites?.[0] ?? null,
    abstract: doc.abstract ?? null,
    tags: doc.tags ?? [],
    mendeley_folders: folderNames,
    mendeley_id: doc.id,
    mendeley_modified: doc.last_modified ?? null,
  };
}

function formatAuthorName(author: MendeleyPersonName): string {
  const last = author.last_name?.trim();
  const first = author.first_name?.trim();
  if (last && first) return `${last}, ${first}`;
  return last || first || "Unknown";
}

export function mergeFrontmatter(
  existing: Record<string, unknown>,
  incoming: NoteFrontmatter
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...existing };
  for (const key of MANAGED_KEYS) {
    merged[key] = incoming[key];
  }
  return merged;
}
