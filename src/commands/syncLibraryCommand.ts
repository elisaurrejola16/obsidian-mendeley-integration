import { App, Notice } from "obsidian";
import { MendeleyClient } from "../api/MendeleyClient";
import { syncLibrary } from "../sync/SyncService";
import type { MendeleySettings } from "../settings/types";
import type { SyncStateData } from "../sync/SyncState";
import { getErrorMessage } from "../utils/errors";

export interface SyncCommandDeps {
  app: App;
  client: MendeleyClient;
  getSettings: () => MendeleySettings;
  getSyncState: () => SyncStateData;
  saveSyncState: (state: SyncStateData) => Promise<void>;
  isConnected: () => boolean;
}

export async function runSyncCommand(
  deps: SyncCommandDeps,
  options: { forceFullSync?: boolean } = {}
): Promise<void> {
  if (!deps.isConnected()) {
    new Notice(
      "Connect your Mendeley account from the plugin settings before syncing."
    );
    return;
  }

  const settings = deps.getSettings();
  const notice = new Notice(
    options.forceFullSync
      ? "Resyncing your entire Mendeley library..."
      : "Syncing Mendeley library...",
    0
  );
  try {
    const syncState = deps.getSyncState();
    const result = await syncLibrary({
      app: deps.app,
      client: deps.client,
      targetFolder: settings.targetFolder,
      noteTemplate: settings.noteTemplate,
      syncState: options.forceFullSync
        ? { ...syncState, lastModifiedSince: null }
        : syncState,
      saveSyncState: deps.saveSyncState,
    });
    notice.hide();
    const summary = `Mendeley: ${result.created} notes created, ${result.updated} updated.`;
    if (result.errors.length > 0) {
      new Notice(
        `${summary} ${result.errors.length} document(s) had errors (see console).`,
        8000
      );
      console.error("Mendeley sync errors:", result.errors);
    } else {
      new Notice(summary, 6000);
    }
  } catch (err) {
    notice.hide();
    new Notice(`Error syncing with Mendeley: ${getErrorMessage(err)}`, 8000);
    console.error(err);
  }
}
