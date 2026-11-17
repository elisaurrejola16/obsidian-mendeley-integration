import { App, normalizePath } from "obsidian";

/** Creates a folder and any missing parents (Vault.createFolder only creates one level). */
export async function ensureFolderExists(app: App, folder: string): Promise<void> {
  const normalized = normalizePath(folder);
  if (!normalized || app.vault.getAbstractFileByPath(normalized)) return;
  const parentPath = normalized.split("/").slice(0, -1).join("/");
  if (parentPath) await ensureFolderExists(app, parentPath);
  if (!app.vault.getAbstractFileByPath(normalized)) {
    await app.vault.createFolder(normalized).catch(() => undefined);
  }
}
