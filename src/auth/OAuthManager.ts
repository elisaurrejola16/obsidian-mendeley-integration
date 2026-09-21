import { requestUrl } from "obsidian";
import { TokenStore, StoredTokens } from "./TokenStore";
import { generateRandomState } from "./pkceState";
import type { MendeleyTokenResponse } from "../api/types";

const AUTHORIZE_URL = "https://api.mendeley.com/oauth/authorize";
const TOKEN_URL = "https://api.mendeley.com/oauth/token";

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export class MendeleyAuthError extends Error {}

/**
 * Implements Mendeley's OAuth2 "Authorization Code" flow
 * (https://dev.mendeley.com/reference/topics/authorization_auth_code.html).
 * The default redirect_uri is a custom obsidian:// scheme captured with
 * registerObsidianProtocolHandler; if Mendeley ever rejected that scheme
 * when registering an app, this module can be repointed to a local loopback
 * server without touching the rest of the plugin.
 */
export class OAuthManager {
  private pendingState: string | null = null;

  constructor(
    private config: () => OAuthConfig,
    private tokenStore: TokenStore
  ) {}

  beginAuthorization(): void {
    const { clientId, redirectUri } = this.config();
    if (!clientId) {
      throw new MendeleyAuthError(
        "The Mendeley Client ID is not configured in the settings."
      );
    }
    this.pendingState = generateRandomState();
    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "all");
    url.searchParams.set("state", this.pendingState);
    window.open(url.toString());
  }

  async handleRedirect(params: Record<string, string>): Promise<void> {
    const { code, state, error, error_description } = params;
    if (error) {
      throw new MendeleyAuthError(
        `Mendeley rejected the authorization: ${error_description || error}`
      );
    }
    if (!code) {
      throw new MendeleyAuthError(
        "Mendeley's response did not include an authorization code."
      );
    }
    if (!this.pendingState || state !== this.pendingState) {
      throw new MendeleyAuthError(
        "The state parameter did not match the expected value. For security, the connection was cancelled; try connecting again from the settings."
      );
    }
    this.pendingState = null;
    await this.exchangeCodeForToken(code);
  }

  private async exchangeCodeForToken(code: string): Promise<void> {
    const { clientId, clientSecret, redirectUri } = this.config();
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }).toString();

    const response = await requestUrl({
      url: TOKEN_URL,
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: basicAuthHeader(clientId, clientSecret),
      },
      body,
      throw: false,
    });

    if (response.status < 200 || response.status >= 300) {
      throw new MendeleyAuthError(
        `Could not obtain an access token (HTTP ${response.status}). Check the Client ID/Secret and make sure the Redirect URI registered with Mendeley exactly matches the one in the plugin settings.`
      );
    }
    const json = response.json as MendeleyTokenResponse;
    await this.tokenStore.setFromTokenResponse(json);
  }

  async refreshAccessToken(): Promise<StoredTokens> {
    const tokens = this.tokenStore.get();
    if (!tokens) {
      throw new MendeleyAuthError(
        "There is no active Mendeley session. Connect first from the settings."
      );
    }
    const { clientId, clientSecret } = this.config();
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tokens.refreshToken,
    }).toString();

    const response = await requestUrl({
      url: TOKEN_URL,
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: basicAuthHeader(clientId, clientSecret),
      },
      body,
      throw: false,
    });

    if (response.status < 200 || response.status >= 300) {
      await this.tokenStore.clear();
      throw new MendeleyAuthError(
        `Could not refresh the Mendeley token (HTTP ${response.status}). Reconnect your account from the settings.`
      );
    }
    const json = response.json as MendeleyTokenResponse;
    return this.tokenStore.setFromTokenResponse(json);
  }

  async disconnect(): Promise<void> {
    await this.tokenStore.clear();
  }

  isConnected(): boolean {
    return this.tokenStore.get() !== null;
  }
}

function basicAuthHeader(clientId: string, clientSecret: string): string {
  return `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
}
