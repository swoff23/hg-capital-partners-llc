import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";
import { HG_TIME_ZONE } from "./dates";

/* tailwind-merge reads any unknown text-*, shadow-* or ease-* as a color, so
   cn("text-fg-2", "text-body") would drop the color. It learns the token names
   from app/globals.css here: the type scale, elevation and motion. */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["title", "section", "body", "label", "meta", "micro", "figure-l", "figure-m", "code", "code-l"],
      shadow: ["float", "overlay"],
      "inset-shadow": ["photo-edge"],
      ease: ["spring"],
    },
    classGroups: {
      duration: [{ duration: ["0", "fast", "base", "toast", "sheet", "photo", "check"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** The number in a money value (a number, a numeric string or a Prisma Decimal), or null when it's empty or unreadable. */
export function toMoneyNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "object" && "toNumber" in (v as object) ? (v as { toNumber(): number }).toNumber() : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function fmtMoney(v: unknown, opts: { compact?: boolean } = {}): string {
  const n = toMoneyNumber(v);
  if (n === null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
    notation: opts.compact ? "compact" : "standard",
  }).format(n);
}

/** Instants (createdAt, updatedAt, sync times). For date-only fields use fmtDay in @/lib/dates. */
export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

/** An instant with its time, in Buffalo time wherever it renders (Vercel runs in UTC). */
export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    timeZone: HG_TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Up to two initials, letters only: "Zack Smith" → "ZS". Anything in
 * parentheses is a nickname or a company, not part of the name: "Jacob (Jake)
 * Hoak" → "JH", "Zack (Outlaw Carpentry)" → "Z". A name that is an email
 * address, as some legacy assignee names are, counts as one. With no name,
 * the email's local part stands in, split on dots, dashes and underscores:
 * "zack.smith@x.com" → "ZS". "?" when there's neither.
 */
export function initials(name: string | null | undefined, email?: string | null): string {
  const letters = (s: string, sep: RegExp) =>
    s
      .split(sep)
      .map((w) => w.replace(/[^\p{L}]/gu, ""))
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w.charAt(0).toUpperCase())
      .join("");
  const fromEmail = (e: string) => letters(e.split("@")[0].replace(/\+.*$/, ""), /[\s._-]+/);
  const n = (name ?? "").trim();
  const fromName = n.includes("@") ? fromEmail(n) : letters(n.replace(/\([^)]*\)?/g, " "), /\s+/);
  return fromName || fromEmail(email ?? "") || "?";
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const n = bytes / 1024 ** i;
  return `${i === 0 ? n : n.toFixed(n < 10 ? 1 : 0)} ${units[i]}`;
}
