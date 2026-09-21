import type { MendeleyFolder } from "../api/types";

export function sanitizePathSegment(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, "-").trim();
  return cleaned || "Unnamed";
}

/**
 * Builds each Mendeley folder's full nested path by following parent_id,
 * e.g. "Thesis/Alzheimer/Microbiota". If the data ever contained an
 * unexpected cycle, resolution stops there instead of recursing forever.
 */
export function buildFolderPaths(
  folders: MendeleyFolder[]
): Map<string, string> {
  const byId = new Map(folders.map((f) => [f.id, f] as const));
  const memo = new Map<string, string>();

  function resolve(id: string, visiting: Set<string>): string {
    const cached = memo.get(id);
    if (cached) return cached;
    const folder = byId.get(id);
    if (!folder) return "Unknown folder";
    const name = sanitizePathSegment(folder.name);
    if (visiting.has(id)) return name;
    visiting.add(id);
    const path =
      folder.parent_id && byId.has(folder.parent_id)
        ? `${resolve(folder.parent_id, visiting)}/${name}`
        : name;
    memo.set(id, path);
    return path;
  }

  const result = new Map<string, string>();
  for (const folder of folders) {
    result.set(folder.id, resolve(folder.id, new Set()));
  }
  return result;
}

/**
 * An Obsidian note can only live in one folder; if a document belongs to
 * several Mendeley folders at once, the alphabetically first path is chosen
 * as its location. The full folder list is still kept in the frontmatter's
 * `mendeley_folders` field (see frontmatterMapping.ts).
 */
export function pickPrimaryFolderPath(
  folderIds: string[],
  folderPathsById: ReadonlyMap<string, string>
): string | null {
  const paths = folderIds
    .map((id) => folderPathsById.get(id))
    .filter((p): p is string => Boolean(p));
  if (paths.length === 0) return null;
  return [...paths].sort((a, b) => a.localeCompare(b))[0];
}
