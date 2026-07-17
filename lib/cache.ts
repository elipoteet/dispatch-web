// In-memory TTL cache for provider responses. Shared across requests within
// a single server process — same interface a Postgres-backed price_cache
// table (see dispatch-backend-architecture.md section 2) would expose, so
// swapping the implementation later doesn't touch callers.
//
// Note: resets on redeploy/restart, and isn't shared across serverless
// instances. Fine for a single dev/small deployment; the Postgres table is
// the upgrade path once that matters.

type Entry<T> = { value: T; expiresAt: number };

const store = new Map<string, Entry<unknown>>();

export function getCached<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.value as T;
}

export function setCached<T>(key: string, value: T, ttlMs: number): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

// Fetches `fn()` only on a cache miss/expiry, otherwise returns the cached value.
export async function withCache<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  const cached = getCached<T>(key);
  if (cached !== null) return cached;
  const value = await fn();
  setCached(key, value, ttlMs);
  return value;
}
