import { App, Notice, TFile } from "obsidian";
import { NoteSnapshot, planDuplicateCleanup } from "../sync/Duplicates";
import { confirmAction } from "../ui/ConfirmModal";

/**
 * Finds notes that share a mendeley_id (left behind by older versions) and,
 * after confirmation, moves the extra copies that contain nothing of the
 * user's to the trash. Copies holding the user's own text are never touched.
 */
export async function runCleanupDuplicates(app: App): Promise<void> {
  const files = new Map<string, TFile>();
  const snapshots: NoteSnapshot[] = [];

  for (const file of app.vault.getMarkdownFiles()) {
    const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter as
      | Record<string, unknown>
      | undefined;
    const mendeleyId = frontmatter?.mendeley_id;
    if (typeof mendeleyId !== "string") continue;
    files.set(file.path, file);
    snapshots.push({
      path: file.path,
      mendeleyId,
      ctime: file.stat.ctime,
      content: await app.vault.cachedRead(file),
    });
  }

  const plan = planDuplicateCleanup(snapshots);
  if (plan.trash.length === 0 && plan.keptWithUserText.length === 0) {
    new Notice("No duplicate reference notes found.");
    return;
  }

  if (plan.keptWithUserText.length > 0) {
    console.warn(
      "Duplicate notes that contain your own text were left untouched:",
      plan.keptWithUserText
    );
  }
  if (plan.trash.length === 0) {
    new Notice(
      `${plan.keptWithUserText.length} duplicate note(s) contain your own text, so none were removed (see console).`,
      8000
    );
    return;
  }

  const kept =
    plan.keptWithUserText.length > 0
      ? ` ${plan.keptWithUserText.length} other duplicate(s) hold your own text and will be left alone.`
      : "";
  const confirmed = await confirmAction(
    app,
    "Remove duplicate notes?",
    `Found ${plan.trash.length} duplicate reference note(s) with nothing written by you in them. The original of each reference (the oldest note, with your text) is kept. They will be moved to the trash, so you can restore them.${kept}`,
    `Move ${plan.trash.length} to trash`
  );
  if (!confirmed) return;

  let trashed = 0;
  for (const path of plan.trash) {
    const file = files.get(path);
    if (!file) continue;
    await app.fileManager.trashFile(file);
    trashed++;
  }
  new Notice(`Moved ${trashed} duplicate note(s) to the trash.`, 6000);
}
