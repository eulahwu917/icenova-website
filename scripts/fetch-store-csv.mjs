const DEFAULT_ATTEMPTS = 4;
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_RETRY_DELAYS_MS = [2_000, 8_000, 30_000];
const RETRYABLE_HTTP_STATUSES = new Set([400, 408, 425, 429]);

function isRetryableStatus(status) {
  return RETRYABLE_HTTP_STATUSES.has(status) || status >= 500;
}

function responseSnippet(text) {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact ? compact.slice(0, 300) : "<empty response>";
}

function errorDescription(error) {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function wait(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

export async function fetchStoreCsv(url, options = {}) {
  const {
    attempts = DEFAULT_ATTEMPTS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retryDelaysMs = DEFAULT_RETRY_DELAYS_MS,
    fetchImpl = globalThis.fetch,
    sleep = wait,
    warn = console.warn,
  } = options;

  const failures = [];
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const startedAt = Date.now();
    let shouldRetry = true;

    try {
      const response = await fetchImpl(url, {
        headers: { "user-agent": "icenova-store-sync/1.0" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      const body = await response.text();
      if (response.ok) return body;

      shouldRetry = isRetryableStatus(response.status);
      failures.push(
        `Attempt ${attempt}: HTTP ${response.status} after ${Date.now() - startedAt}ms` +
          ` (${response.headers.get("content-type") || "unknown content type"}).` +
          ` Response: ${responseSnippet(body)}`,
      );
    } catch (error) {
      failures.push(`Attempt ${attempt}: failed after ${Date.now() - startedAt}ms (${errorDescription(error)}).`);
    }

    if (!shouldRetry || attempt === attempts) break;

    const delayMs = retryDelaysMs[Math.min(attempt - 1, retryDelaysMs.length - 1)] ?? 0;
    warn(`${failures.at(-1)} Retrying in ${delayMs}ms.`);
    await sleep(delayMs);
  }

  const attemptLabel = failures.length === 1 ? "attempt" : "attempts";
  throw new Error(`Google Sheet download failed after ${failures.length} ${attemptLabel}.\n${failures.join("\n")}`);
}
