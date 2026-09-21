import { requestUrl, RequestUrlParam } from "obsidian";
import { OAuthManager } from "../auth/OAuthManager";
import { TokenStore } from "../auth/TokenStore";
import { withRetry } from "../utils/retry";

const API_BASE = "https://api.mendeley.com";

export class MendeleyApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "MendeleyApiError";
  }
}

export interface MendeleyResponse<T> {
  data: T;
  nextMarkerUrl: string | null;
  totalCount: number | null;
}

/**
 * Minimal HTTP client on top of requestUrl (avoids fetch to sidestep CORS
 * issues in Obsidian's context). Refreshes the access token proactively and
 * retries with backoff on 429/5xx.
 */
export class MendeleyClient {
  constructor(
    private tokenStore: TokenStore,
    private authManager: OAuthManager
  ) {}

  request<T>(
    path: string,
    params?: Record<string, string | number | undefined>
  ): Promise<MendeleyResponse<T>> {
    return this.requestByUrl<T>(buildUrl(path, params));
  }

  requestByUrl<T>(url: string): Promise<MendeleyResponse<T>> {
    return withRetry(
      () => this.doRequest<T>(url, true),
      (err) =>
        err instanceof MendeleyApiError &&
        (err.status === 429 || err.status >= 500),
      () => null,
      { maxRetries: 5, baseDelayMs: 500 }
    );
  }

  private async ensureFreshToken(): Promise<void> {
    if (this.tokenStore.isExpiringSoon()) {
      await this.authManager.refreshAccessToken();
    }
  }

  private async doRequest<T>(
    url: string,
    allowAuthRetry: boolean
  ): Promise<MendeleyResponse<T>> {
    await this.ensureFreshToken();
    const tokens = this.tokenStore.get();
    if (!tokens) {
      throw new MendeleyApiError(
        401,
        "There is no active Mendeley session. Connect from the plugin settings."
      );
    }

    const requestParams: RequestUrlParam = {
      url,
      method: "GET",
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
      throw: false,
    };
    const response = await requestUrl(requestParams);

    if (response.status === 401 && allowAuthRetry) {
      await this.authManager.refreshAccessToken();
      return this.doRequest<T>(url, false);
    }
    if (response.status === 401) {
      throw new MendeleyApiError(
        401,
        "Mendeley rejected the session. Reconnect your account from the plugin settings."
      );
    }
    if (response.status === 429) {
      throw new MendeleyApiError(
        429,
        "Mendeley is rate-limiting requests (429)."
      );
    }
    if (response.status >= 500) {
      throw new MendeleyApiError(
        response.status,
        `Temporary Mendeley server error (HTTP ${response.status}).`
      );
    }
    if (response.status >= 400) {
      throw new MendeleyApiError(
        response.status,
        `Mendeley responded with an error (HTTP ${response.status}).`
      );
    }

    const headers = response.headers ?? {};
    const linkHeader = headers["link"] ?? headers["Link"];
    const countHeader = headers["mendeley-count"] ?? headers["Mendeley-Count"];

    return {
      data: response.json as T,
      nextMarkerUrl: parseNextLink(linkHeader),
      totalCount: countHeader ? Number(countHeader) : null,
    };
  }
}

function buildUrl(
  path: string,
  params?: Record<string, string | number | undefined>
): string {
  const url = new URL(path.startsWith("http") ? path : `${API_BASE}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function parseNextLink(linkHeader?: string): string | null {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(",")) {
    const match = part.match(/<([^>]+)>;\s*rel="?next"?/);
    if (match) return match[1];
  }
  return null;
}
