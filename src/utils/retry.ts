export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
}

/**
 * Retries `fn` with exponential backoff on errors marked as retryable
 * (meant for 429 and 5xx from the Mendeley API, whose exact rate limits
 * aren't publicly documented).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  isRetryable: (err: unknown) => boolean,
  getRetryAfterMs: (err: unknown) => number | null,
  options: RetryOptions = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 5;
  const baseDelayMs = options.baseDelayMs ?? 500;
  let attempt = 0;

  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= maxRetries || !isRetryable(err)) {
        throw err;
      }
      const explicit = getRetryAfterMs(err);
      const backoff = explicit ?? baseDelayMs * Math.pow(2, attempt);
      await sleep(backoff);
      attempt++;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
