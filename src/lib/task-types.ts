/** Link-style attachments, stored on `Task.links` (a JSON column). */
export type TaskAttachment = { url: string; title: string };

export function parseAttachments(value: unknown): TaskAttachment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const url = (item as Record<string, unknown>).url;
    if (typeof url !== "string" || !url) return [];
    const rawTitle = (item as Record<string, unknown>).title;
    const title = typeof rawTitle === "string" && rawTitle.trim() ? rawTitle.trim() : url;
    return [{ url, title }];
  });
}

/** Prepend https:// when the user pasted a bare host/path. */
export function normalizeAttachmentUrl(input: string): string {
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[a-z]+:\/\//i.test(trimmed)) return trimmed; // mailto:, ftp:, etc. left as-is
  return `https://${trimmed}`;
}
