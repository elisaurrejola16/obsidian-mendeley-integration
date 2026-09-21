import { Plugin, Notice, ObsidianProtocolData } from "obsidian";
import { DEFAULT_SETTINGS, MendeleySettings } from "./settings/types";
import { SettingsTab } from "./settings/SettingsTab";
import { TokenStore, StoredTokens } from "./auth/TokenStore";
import { OAuthManager, MendeleyAuthError } from "./auth/OAuthManager";
import { MendeleyClient } from "./api/MendeleyClient";
import { runSyncCommand } from "./commands/syncLibraryCommand";
import { DEFAULT_SYNC_STATE, SyncStateData } from "./sync/SyncState";

const REDIRECT_ACTION = "mendeley-auth-callback";

interface PluginData {
  settings: MendeleySettings;
  auth: StoredTokens | null;
  syncState: SyncStateData;
}

export default class MendeleyPlugin extends Plugin {
  data: PluginData = {
    settings: DEFAULT_SETTINGS,
    auth: null,
    syncState: DEFAULT_SYNC_STATE,
  };
  tokenStore!: TokenStore;
  authManager!: OAuthManager;
  client!: MendeleyClient;

  async onload(): Promise<void> {
    await this.loadPluginData();

    this.tokenStore = new TokenStore(
      () => this.data.auth,
      async (tokens) => {
        this.data.auth = tokens;
        await this.savePluginData();
      }
    );

    this.authManager = new OAuthManager(
      () => ({
        clientId: this.data.settings.clientId,
        clientSecret: this.data.settings.clientSecret,
        redirectUri: this.data.settings.redirectUri,
      }),
      this.tokenStore
    );

    this.client = new MendeleyClient(this.tokenStore, this.authManager);

    this.registerObsidianProtocolHandler(
      REDIRECT_ACTION,
      (params: ObsidianProtocolData) => {
        this.authManager
          .handleRedirect(params as unknown as Record<string, string>)
          .then(() => new Notice("Connected to Mendeley successfully."))
          .catch((err: unknown) => {
            const message =
              err instanceof MendeleyAuthError
                ? err.message
                : "Unexpected error connecting to Mendeley.";
            new Notice(message, 8000);
            console.error(err);
          });
      }
    );

    this.addSettingTab(new SettingsTab(this.app, this));

    const syncDeps = {
      app: this.app,
      client: this.client,
      getSettings: () => this.data.settings,
      getSyncState: () => this.data.syncState,
      saveSyncState: async (state: SyncStateData) => {
        this.data.syncState = state;
        await this.savePluginData();
      },
      isConnected: () => this.authManager.isConnected(),
    };

    this.addCommand({
      id: "sync-mendeley-library",
      name: "Sync Mendeley library",
      callback: () => runSyncCommand(syncDeps),
    });

    this.addCommand({
      id: "sync-mendeley-library-full",
      name: "Mendeley: full resync (ignore incremental progress)",
      callback: () => runSyncCommand(syncDeps, { forceFullSync: true }),
    });
  }

  onunload(): void {}

  async loadPluginData(): Promise<void> {
    const loaded = (await this.loadData()) as Partial<PluginData> | null;
    this.data = {
      settings: { ...DEFAULT_SETTINGS, ...(loaded?.settings ?? {}) },
      auth: loaded?.auth ?? null,
      syncState: { ...DEFAULT_SYNC_STATE, ...(loaded?.syncState ?? {}) },
    };
  }

  async savePluginData(): Promise<void> {
    await this.saveData(this.data);
  }

  async saveSettings(settings: MendeleySettings): Promise<void> {
    this.data.settings = settings;
    await this.savePluginData();
  }
}
