export interface SyncStateData {
  lastModifiedSince: string | null;
  lastSyncedAt: string | null;
}

export const DEFAULT_SYNC_STATE: SyncStateData = {
  lastModifiedSince: null,
  lastSyncedAt: null,
};
