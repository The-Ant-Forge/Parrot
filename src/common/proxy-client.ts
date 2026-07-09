/**
 * Shared community-proxy client factory (Radarr / Sonarr skyhook).
 *
 * Both proxies get the same treatment: 4-second timeout, circuit breaker
 * (per client), write-through proxy cache, and coalescing of concurrent
 * cache misses on the same key so simultaneous tabs share one request.
 */

import { createCircuitBreaker } from "./circuit-breaker";
import { debugLog } from "./logger";
import { getProxyCache, setProxyCache } from "./storage";

const TIMEOUT_MS = 4000;

export interface ProxyClient {
  /** Raw GET with timeout + circuit breaker; null on any failure. */
  fetch<T>(path: string): Promise<T | null>;
  /** Fetch + cache write, coalescing concurrent requests per cache key. */
  fetchAndCache<T>(cacheKey: string, path: string): Promise<T | null>;
  /** Cache-first: serve a fresh cache entry, else fetchAndCache. */
  cachedFetch<T>(cacheKey: string, ttl: number, path: string): Promise<T | null>;
}

export function createProxyClient(baseUrl: string, tag: string): ProxyClient {
  const breaker = createCircuitBreaker();
  const inflight = new Map<string, Promise<unknown>>();

  async function rawFetch<T>(path: string): Promise<T | null> {
    if (breaker.isOpen()) {
      debugLog(tag, "circuit breaker open, skipping");
      return null;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(`${baseUrl}${path}`, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });

      if (!res.ok) {
        breaker.recordFailure();
        debugLog(tag, `HTTP ${res.status} for ${path}`);
        return null;
      }

      const data = (await res.json()) as T;
      breaker.recordSuccess();
      return data;
    } catch (err) {
      breaker.recordFailure();
      debugLog(tag, `fetch failed for ${path}:`, err);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  function fetchAndCache<T>(cacheKey: string, path: string): Promise<T | null> {
    const existing = inflight.get(cacheKey);
    if (existing) return existing as Promise<T | null>;
    const p = (async () => {
      try {
        const data = await rawFetch<T>(path);
        if (data) await setProxyCache(cacheKey, data);
        return data;
      } finally {
        inflight.delete(cacheKey);
      }
    })();
    inflight.set(cacheKey, p);
    return p;
  }

  async function cachedFetch<T>(cacheKey: string, ttl: number, path: string): Promise<T | null> {
    const cached = await getProxyCache<T>(cacheKey, ttl);
    if (cached) {
      debugLog(tag, `cache hit for ${cacheKey}`);
      return cached;
    }
    return fetchAndCache<T>(cacheKey, path);
  }

  return { fetch: rawFetch, fetchAndCache, cachedFetch };
}
