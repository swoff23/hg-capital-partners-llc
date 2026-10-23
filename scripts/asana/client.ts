/**
 * Minimal read-only Asana REST client for the one-time export.
 *
 *   - GET only. Nothing in scripts/asana/ ever writes to Asana.
 *   - Bearer auth with ASANA_TOKEN, sent to app.asana.com only. File downloads
 *     go to pre-signed URLs with no Authorization header.
 *   - At most `concurrency` requests in flight. Asana allows 50 concurrent
 *     GETs and 1,500 requests a minute on paid plans (150 on free).
 *   - 429 waits for Retry-After; 5xx and network errors back off and retry.
 *     See retryDelayMs in src/lib/asana/snapshot-helpers.ts.
 */
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { nextOffset, retryDelayMs, type AsanaPage } from "../../src/lib/asana/snapshot-helpers";

const BASE = "https://app.asana.com/api/1.0";

export class AsanaError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    message: string,
  ) {
    super(`Asana ${status} on ${path}: ${message}`);
    this.name = "AsanaError";
  }
}

type Params = Record<string, string | number | boolean | undefined>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class AsanaClient {
  private active = 0;
  private waiting: Array<() => void> = [];
  /** Requests sent, including retries. */
  requests = 0;

  constructor(
    private readonly token: string,
    private readonly concurrency = 6,
  ) {}

  private async slot<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.concurrency) await new Promise<void>((r) => this.waiting.push(r));
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.waiting.shift()?.();
    }
  }

  private url(apiPath: string, params: Params): string {
    const u = new URL(BASE + apiPath);
    for (const [k, v] of Object.entries(params)) if (v !== undefined) u.searchParams.set(k, String(v));
    return u.toString();
  }

  /** One GET, retried per retryDelayMs. Returns the parsed JSON body. */
  private async request<T>(apiPath: string, params: Params): Promise<T> {
    const url = this.url(apiPath, params);
    for (let attempt = 1; ; attempt++) {
      let status = 0;
      let retryAfter: string | null = null;
      let detail = "network error";
      try {
        this.requests++;
        const res = await this.slot(() =>
          fetch(url, { headers: { Authorization: `Bearer ${this.token}`, Accept: "application/json" } }),
        );
        if (res.ok) return (await res.json()) as T;
        status = res.status;
        retryAfter = res.headers.get("retry-after");
        detail = (await res.text()).slice(0, 300);
      } catch (err) {
        detail = err instanceof Error ? err.message : String(err);
      }
      const wait = retryDelayMs(status, retryAfter, attempt);
      if (wait === null) throw new AsanaError(status, apiPath, detail);
      await sleep(wait);
    }
  }

  /** GET a single object (Asana wraps it in `data`). */
  async get<T>(apiPath: string, params: Params = {}): Promise<T> {
    const body = await this.request<{ data: T }>(apiPath, params);
    return body.data;
  }

  /** GET every page of a list endpoint. */
  async getAll<T>(apiPath: string, params: Params = {}): Promise<T[]> {
    const out: T[] = [];
    let offset: string | null = null;
    do {
      const page: AsanaPage<T> = await this.request<AsanaPage<T>>(apiPath, { ...params, limit: 100, offset: offset ?? undefined });
      out.push(...page.data);
      offset = nextOffset(page);
    } while (offset);
    return out;
  }

  /** Run `fn` over `items` with this client's concurrency. Errors are returned per item, not thrown. */
  async each<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<Array<{ item: T; result?: R; error?: unknown }>> {
    const results: Array<{ item: T; result?: R; error?: unknown }> = new Array(items.length);
    let next = 0;
    const worker = async () => {
      while (next < items.length) {
        const i = next++;
        try {
          results[i] = { item: items[i], result: await fn(items[i]) };
        } catch (error) {
          results[i] = { item: items[i], error };
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(this.concurrency, items.length) }, worker));
    return results;
  }
}

/**
 * Stream a pre-signed download URL to `dest`. Bytes go to a .part file that is
 * renamed only once its size matches `expected` (when known), so a truncated
 * download never sits under the real name. No Authorization header: the URL
 * carries its own signature, and the token must never leave app.asana.com.
 * Returns bytes written. Throws AsanaError(403) when the link has expired, so
 * the caller can fetch a fresh one.
 */
export async function downloadTo(url: string, dest: string, expected: number | null): Promise<number> {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) throw new AsanaError(res.status, "(download)", `download failed: ${res.statusText}`);
  const part = `${dest}.part`;
  try {
    await pipeline(Readable.fromWeb(res.body as WebReadableStream<Uint8Array>), fs.createWriteStream(part));
    const bytes = fs.statSync(part).size;
    if (expected != null && bytes !== expected) throw new Error(`size ${bytes} != expected ${expected}`);
    fs.renameSync(part, dest);
    return bytes;
  } catch (err) {
    fs.rmSync(part, { force: true });
    throw err;
  }
}
