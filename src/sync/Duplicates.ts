import { MANAGED_KEYS, NoteFrontmatter } from "../templates/frontmatterMapping";

export interface NoteSnapshot {
  path: string;
  mendeleyId: string;
  ctime: number;
  content: string;
}

export interface CleanupPlan {
  /** Duplicates with nothing of the user's in them: safe to move to the trash. */
  trash: string[];
  /** Extra copies that DO contain the user's own text: never touched, only reported. */
  keptWithUserText: string[];
}

/** True if the note holds anything the plugin did not generate (own text, extra frontmatter keys). */
export function hasUserContent(content: string): boolean {
  let text = content;
  const frontmatter = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (frontmatter) {
    const keys = [...frontmatter[1].matchAll(/^([A-Za-z0-9_-]+):/gm)].map((m) => m[1]);
    if (keys.some((key) => !MANAGED_KEYS.includes(key as keyof NoteFrontmatter))) {
      return true;
    }
    text = text.slice(frontmatter[0].length);
  }
  text = text
    .replace(/<!-- mendeley:start -->[\s\S]*?<!-- mendeley:end -->/g, "")
    .replace(/<!-- mendeley-pdf:start -->[\s\S]*?<!-- mendeley-pdf:end -->/g, "")
    .replace(/^#+\s*(My notes|Mis notas)\s*$/gim, "");
  return text.trim().length > 0;
}

/**
 * Several notes for the same Mendeley document are duplicates. The one to keep
 * is the oldest among those holding the user's text (or the oldest overall).
 * Other copies are only trashable when they contain nothing of the user's.
 */
export function planDuplicateCleanup(notes: NoteSnapshot[]): CleanupPlan {
  const groups = new Map<string, NoteSnapshot[]>();
  for (const note of notes) {
    const list = groups.get(note.mendeleyId) ?? [];
    list.push(note);
    groups.set(note.mendeleyId, list);
  }

  const plan: CleanupPlan = { trash: [], keptWithUserText: [] };
  const oldestFirst = (a: NoteSnapshot, b: NoteSnapshot) =>
    a.ctime - b.ctime || a.path.length - b.path.length;

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const withText = group.filter((n) => hasUserContent(n.content));
    const keeper = [...(withText.length > 0 ? withText : group)].sort(oldestFirst)[0];
    for (const note of group) {
      if (note === keeper) continue;
      if (hasUserContent(note.content)) plan.keptWithUserText.push(note.path);
      else plan.trash.push(note.path);
    }
  }
  return plan;
}
