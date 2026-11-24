import { UPLOAD_RULES, fileKindForType, uploadContentType, type FileKind } from "@/lib/attachments/content-types";
import type { EmailEnv } from "@/lib/env";

/**
 * A received email, read back from Resend (docs/specs/contractor-job-emails.md, section 5, and
 * docs/contractor-invoices-plan.md, 4.3). Resend's webhook carries only the email's id; the email and its
 * attachments are fetched inline, by every inbox the router (src/lib/email/inboxes.ts) hands one to: job replies
 * (replies.ts) and the invoice inbox (src/lib/invoices/inbound.ts). No `server-only`, so the inboxes' tests can use
 * the types and sortFile; only resendGet and downloadAttachment touch the network.
 */

const RESEND_API = "https://api.resend.com";

/** An inline picture under this size is a signature's logo, not a photo of the job or a bill. */
export const SIGNATURE_IMAGE_MAX = 30_000;

export interface ReceivedEmail {
  id: string;
  from: string;
  to: string[] | null;
  cc: string[] | null;
  received_for: string[] | null;
  subject: string | null;
  text: string | null;
  html: string | null;
  headers: Record<string, string> | null;
  /** Resend's checks of the sender: "pass", "fail", "gray", "processing_failed" or "unknown". Null on old emails. */
  authentication: { spf?: string; dkim?: string; dmarc?: string } | null;
  /** When Resend received it (ISO). The same on every retry of the webhook. */
  created_at?: string | null;
}

export interface ReceivedAttachment {
  id: string;
  filename: string | null;
  size: number;
  content_type: string | null;
  content_disposition: string | null;
  content_id: string | null;
  download_url: string;
}

/** A GET on Resend's API, as the email's key. */
export async function resendGet<T>(config: EmailEnv, path: string): Promise<T> {
  const res = await fetch(`${RESEND_API}${path}`, { headers: { Authorization: `Bearer ${config.apiKey}` }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Resend ${res.status} on ${path}`);
  return (await res.json()) as T;
}

/** The received email by its id. */
export function fetchReceivedEmail(config: EmailEnv, emailId: string): Promise<ReceivedEmail> {
  return resendGet<ReceivedEmail>(config, `/emails/receiving/${encodeURIComponent(emailId)}`);
}

/** Its attachments, up to 100. */
export async function fetchReceivedAttachments(config: EmailEnv, emailId: string): Promise<ReceivedAttachment[]> {
  const list = await resendGet<{ data: ReceivedAttachment[] }>(config, `/emails/receiving/${encodeURIComponent(emailId)}/attachments?limit=100`);
  return list.data;
}

/** One attachment's bytes, from its signed download link. */
export async function downloadAttachment(a: ReceivedAttachment): Promise<Buffer> {
  const res = await fetch(a.download_url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`Couldn't download ${a.filename ?? a.id}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** What a file is, and whether it may post: photos, videos and documents, within each kind's size cap. */
export function sortFile(a: ReceivedAttachment): { kind: FileKind; type: string } | { tooBig: true } | null {
  // The name's extension when the mail app sent a generic type (application/octet-stream, image/jpg), as uploads do.
  const type = uploadContentType(a.filename ?? "", a.content_type) ?? "";
  const kind = fileKindForType(type);
  if (!kind) return null;
  const rule = UPLOAD_RULES[kind];
  if (!rule.contentTypes.includes(type)) return null;
  if (a.content_disposition === "inline" && a.content_id && kind === "image" && a.size < SIGNATURE_IMAGE_MAX) return null;
  if (a.size > rule.maxBytes) return { tooBig: true };
  return { kind, type };
}

/** Every address the email was sent to: To, the addresses Resend received it for (a Bcc among them), and Cc. */
export function recipientsOf(email: Pick<ReceivedEmail, "to" | "cc" | "received_for">): string[] {
  return [...(email.to ?? []), ...(email.received_for ?? []), ...(email.cc ?? [])];
}
