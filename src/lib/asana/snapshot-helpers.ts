/**
 * Pure helpers for the Asana export (scripts/asana/10-snapshot.ts). No I/O,
 * so they're unit-tested in snapshot-helpers.test.ts and CI covers them.
 */

/** Asana's paginated list envelope. */
export interface AsanaPage<T> {
  data: T[];
  next_page: { offset: string } | null;
}

/** The offset to request next, or null on the last page. */
export function nextOffset(page: { next_page?: { offset?: string | null } | null }): string | null {
  return page.next_page?.offset || null;
}

/**
 * How long to wait before retrying a failed request, or null to give up.
 * 429: honor Retry-After (seconds), default 30s. 5xx and network errors
 * (status 0): exponential backoff from 1s, capped at 30s. Anything else
 * (400, 401, 403, 404) isn't retryable. Gives up after `maxAttempts`.
 */
export function retryDelayMs(
  status: number,
  retryAfter: string | null,
  attempt: number,
  maxAttempts = 6,
): number | null {
  if (attempt >= maxAttempts) return null;
  if (status === 429) {
    const seconds = Number(retryAfter);
    return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds * 1000) : 30_000;
  }
  if (status === 0 || (status >= 500 && status <= 599)) {
    return Math.min(30_000, 1000 * 2 ** (attempt - 1));
  }
  return null;
}

/**
 * A file name that's safe to write to disk: no path separators or control
 * characters, no leading dots, at most 150 characters with the extension
 * kept. Asana names repeat ("image.jpg"), so callers put each file in a
 * folder named for its attachment ID.
 */
export function safeFileName(name: string): string {
  const cleaned = name
    .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "");
  if (!cleaned) return "file";
  if (cleaned.length <= 150) return cleaned;
  const dot = cleaned.lastIndexOf(".");
  const ext = dot > 0 && cleaned.length - dot <= 10 ? cleaned.slice(dot) : "";
  return cleaned.slice(0, 150 - ext.length) + ext;
}

/** Asana stores the file itself only for host "asana"; the rest are links (Dropbox, Drive, Box, ...). */
export function isAsanaHosted(attachment: { host?: string | null }): boolean {
  return attachment.host === "asana";
}

/** Count items by a key, sorted by count descending. For the manifest's summaries. */
export function countBy<T>(items: Iterable<T>, key: (item: T) => string | null | undefined): Record<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const k = key(item) ?? "(none)";
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return Object.fromEntries([...counts].sort((a, b) => b[1] - a[1]));
}

/** "2026-10-23T14:05:09.123Z" -> "2026-10-23T14-05-09Z": a sortable folder name. */
export function snapshotStamp(iso: string): string {
  return iso.replace(/\.\d+Z$/, "Z").replace(/:/g, "-");
}
