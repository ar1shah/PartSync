/**
 * Env-gated performance instrumentation for the inventory load path.
 *
 * Everything here is a no-op unless `PERF_LOGS=1`, so these calls are safe to
 * leave in the codebase permanently — the gate matters because
 * `logPayloadSize` serializes whatever it is handed, which is itself expensive
 * for a 10k-row catalog.
 *
 * Usage:
 *   PERF_LOGS=1 pnpm build && PERF_LOGS=1 pnpm start
 */

const enabled = process.env.PERF_LOGS === "1";

/** True when `PERF_LOGS=1`. Use to skip building debug values entirely. */
export const perfEnabled = enabled;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Times `fn` and logs the elapsed wall-clock ms. Returns whatever `fn` returns.
 * Takes `PromiseLike` so Supabase query builders can be passed directly.
 */
export async function timed<T>(label: string, fn: () => PromiseLike<T>): Promise<T> {
  if (!enabled) return fn();

  const start = performance.now();
  let outcome = "ok";
  try {
    return await fn();
  } catch (error) {
    outcome = "threw";
    throw error;
  } finally {
    const ms = performance.now() - start;
    console.log(`[perf] ${label} ${ms.toFixed(1)}ms${outcome === "ok" ? "" : ` (${outcome})`}`);
  }
}

/**
 * Logs the serialized size of a value that is about to cross to the client.
 * Not an exact RSC payload size, but the right order of magnitude and the
 * number to compare before/after.
 */
export function logPayloadSize(label: string, value: unknown): void {
  if (!enabled) return;

  try {
    const json = JSON.stringify(value);
    const bytes = json === undefined ? 0 : Buffer.byteLength(json, "utf8");
    const rows = Array.isArray(value) ? ` (${value.length} rows)` : "";
    console.log(`[perf] ${label} payload ${formatBytes(bytes)}${rows}`);
  } catch (error) {
    console.log(`[perf] ${label} payload size unavailable`, error);
  }
}
