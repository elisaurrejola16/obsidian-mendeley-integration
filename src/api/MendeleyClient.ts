import { request as httpsRequest } from "https";
import { requestUrl, RequestUrlParam, RequestUrlResponse } from "obsidian";
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

const isRetryable = (err: unknown): boolean =>
  err instanceof MendeleyApiError && (err.status === 429 || err.status >= 500);

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
      isRetryable,
      () => null,
      { maxRetries: 5, baseDelayMs: 500 }
    );
  }

  /**
   * Downloads a Mendeley file. The API answers with a redirect (303) to a
   * short-lived signed storage URL (S3). requestUrl always follows redirects
   * and would forward the Mendeley bearer token to S3, which rejects a second
   * credential ("Only one auth mechanism allowed", HTTP 400). So the first hop
   * uses Node's https (this plugin is desktop-only), which does not follow
   * redirects, and the signed URL is then fetched WITHOUT the token.
   */
  downloadFile(fileId: string): Promise<ArrayBuffer> {
    const url = buildUrl(`/files/${fileId}`);
    return withRetry(
      async () => {
        await this.ensureFreshToken();
        let raw = await getWithoutFollowing(url, this.accessToken());
        if (raw.status === 401) {
          await this.authManager.refreshAccessToken();
          raw = await getWithoutFollowing(url, this.accessToken());
        }
        if (raw.status === 401) {
          throw new MendeleyApiError(
            401,
            "Mendeley rejected the session. Reconnect your account from the plugin settings."
          );
        }
        if (raw.status >= 300 && raw.status < 400 && raw.location) {
          const signed = await requestUrl({ url: raw.location, method: "GET", throw: false });
          if (signed.status >= 400) {
            throw new MendeleyApiError(
              signed.status,
              `Could not download the file from Mendeley's storage (HTTP ${signed.status})${bodySnippet(signed)}.`
            );
          }
          return signed.arrayBuffer;
        }
        if (raw.status >= 400) {
          throw new MendeleyApiError(
            raw.status,
            `Mendeley responded with an error (HTTP ${raw.status})${textSnippet(raw.body.toString("utf8"))}.`
          );
        }
        return raw.body.buffer.slice(
          raw.body.byteOffset,
          raw.body.byteOffset + raw.body.byteLength
        ) as ArrayBuffer;
      },
      isRetryable,
      () => null,
      { maxRetries: 3, baseDelayMs: 500 }
    );
  }

  private accessToken(): string {
    const tokens = this.tokenStore.get();
    if (!tokens) {
      throw new MendeleyApiError(
        401,
        "There is no active Mendeley session. Connect from the plugin settings."
      );
    }
    return tokens.accessToken;
  }

  private async ensureFreshToken(): Promise<void> {
    if (this.tokenStore.isExpiringSoon()) {
      await this.authManager.refreshAccessToken();
    }
  }

  private async authorizedGet(
    url: string,
    allowAuthRetry: boolean
  ): Promise<RequestUrlResponse> {
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
      return this.authorizedGet(url, false);
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
        `Mendeley responded with an error (HTTP ${response.status})${bodySnippet(response)}.`
      );
    }
    return response;
  }

  private async doRequest<T>(
    url: string,
    allowAuthRetry: boolean
  ): Promise<MendeleyResponse<T>> {
    const response = await this.authorizedGet(url, allowAuthRetry);
    const countHeader = getHeader(response.headers, "mendeley-count");

    return {
      data: response.json as T,
      nextMarkerUrl: parseNextLink(getHeader(response.headers, "link")),
      totalCount: countHeader ? Number(countHeader) : null,
    };
  }
}

function getHeader(
  headers: Record<string, string> | undefined,
  name: string
): string | undefined {
  if (!headers) return undefined;
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted) return value;
  }
  return undefined;
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

function textSnippet(raw: string): string {
  const text = raw.trim().replace(/\s+/g, " ").slice(0, 200);
  return text ? `: ${text}` : "";
}

function bodySnippet(response: RequestUrlResponse): string {
  try {
    return textSnippet(response.text);
  } catch {
    return "";
  }
}

interface RawResponse {
  status: number;
  location: string | undefined;
  body: Buffer;
}

/** GET that never follows redirects, so the Authorization header only ever goes to api.mendeley.com. */
function getWithoutFollowing(url: string, token: string): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      url,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "User-Agent": navigator.userAgent,
          Accept: "*/*",
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            location: res.headers.location,
            body: Buffer.concat(chunks),
          })
        );
        res.on("error", reject);
      }
    );
    req.on("error", reject);
    req.end();
  });
}
