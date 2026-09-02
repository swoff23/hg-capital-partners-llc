/**
 * Sliding-window request limiter, keyed by any string (an IP, a form name).
 * In-memory and per-process — on Vercel each warm instance counts on its
 * own, so the effective limit is a small multiple of the configured one.
 * That is enough to stop a script from filling the task list from one
 * public form; it is not a DDoS control.
 *
 * Pure (clock injected); see rate-limit.test.ts.
 */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  /** Record one hit and say whether the key is still within its budget. */
  allow(key: string, now: number = Date.now()): { ok: true } | { ok: false; retryAfterMs: number } {
    const since = now - this.windowMs;
    const list = (this.hits.get(key) ?? []).filter((t) => t > since);
    if (list.length >= this.max) {
      this.hits.set(key, list);
      return { ok: false, retryAfterMs: list[0] + this.windowMs - now };
    }
    list.push(now);
    this.hits.set(key, list);
    return { ok: true };
  }

  /** Drop keys with no hits inside the window. */
  prune(now: number = Date.now()): void {
    const since = now - this.windowMs;
    for (const [k, list] of this.hits) {
      if (!list.some((t) => t > since)) this.hits.delete(k);
    }
  }
}

/** First hop of X-Forwarded-For (Vercel sets it), or "unknown". */
export function clientIp(headers: { get(name: string): string | null }): string {
  const xff = headers.get("x-forwarded-for");
  const first = xff?.split(",")[0]?.trim();
  return first || headers.get("x-real-ip")?.trim() || "unknown";
}
