/**
 * Tiny in-memory TTL cache with request de-duplication: concurrent callers
 * for the same key share one in-flight promise.
 */
export class TtlCache {
  #entries = new Map();
  #inflight = new Map();

  constructor(defaultTtlSeconds) {
    this.defaultTtl = defaultTtlSeconds * 1000;
  }

  async get(key, loader, ttlSeconds) {
    const now = Date.now();
    const hit = this.#entries.get(key);
    if (hit && hit.expires > now) return hit.value;

    if (this.#inflight.has(key)) return this.#inflight.get(key);

    const p = Promise.resolve()
      .then(loader)
      .then((value) => {
        const ttl = ttlSeconds ? ttlSeconds * 1000 : this.defaultTtl;
        this.#entries.set(key, { value, expires: Date.now() + ttl });
        return value;
      })
      .finally(() => this.#inflight.delete(key));

    this.#inflight.set(key, p);
    return p;
  }

  /** Returns a cached value without loading. */
  peek(key) {
    const hit = this.#entries.get(key);
    return hit && hit.expires > Date.now() ? hit.value : undefined;
  }

  set(key, value, ttlSeconds) {
    this.#entries.set(key, { value, expires: Date.now() + (ttlSeconds ? ttlSeconds * 1000 : this.defaultTtl) });
  }

  clear() {
    this.#entries.clear();
  }

  get size() {
    return this.#entries.size;
  }
}
