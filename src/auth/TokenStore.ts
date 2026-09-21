import type { MendeleyTokenResponse } from "../api/types";

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

/**
 * Wraps token persistence without coupling to Obsidian's Plugin class:
 * whoever instantiates it decides how to read/write (normally data.json via
 * saveData/loadData).
 */
export class TokenStore {
  constructor(
    private load: () => StoredTokens | null,
    private save: (tokens: StoredTokens | null) => Promise<void>
  ) {}

  get(): StoredTokens | null {
    return this.load();
  }

  async setFromTokenResponse(
    res: MendeleyTokenResponse
  ): Promise<StoredTokens> {
    const tokens: StoredTokens = {
      accessToken: res.access_token,
      refreshToken: res.refresh_token,
      expiresAt: Date.now() + res.expires_in * 1000,
    };
    await this.save(tokens);
    return tokens;
  }

  async clear(): Promise<void> {
    await this.save(null);
  }

  isExpiringSoon(bufferMs = 60_000): boolean {
    const tokens = this.load();
    if (!tokens) return true;
    return Date.now() + bufferMs >= tokens.expiresAt;
  }
}
