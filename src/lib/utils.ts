import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { HG_TIME_ZONE } from "./dates";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmtMoney(v: unknown, opts: { compact?: boolean } = {}): string {
  if (v == null || v === "") return "—";
  const n = typeof v === "object" && "toNumber" in (v as object) ? (v as { toNumber(): number }).toNumber() : Number(v);
  if (!Number.isFinite(n)) return "—";
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
 * Up to two initials: "Zack Smith" → "ZS". With no name, the email's local
 * part stands in, split on dots, dashes and underscores: "zack.smith@x.com" →
 * "ZS". "?" when there's neither.
 */
export function initials(name: string | null | undefined, email?: string | null): string {
  const words = (s: string, sep: RegExp) =>
    s
      .split(sep)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("");
  const fromName = name ? words(name, /\s+/) : "";
  if (fromName) return fromName;
  const local = (email ?? "").split("@")[0].replace(/\+.*$/, "");
  return words(local, /[\s._-]+/) || "?";
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const n = bytes / 1024 ** i;
  return `${i === 0 ? n : n.toFixed(n < 10 ? 1 : 0)} ${units[i]}`;
}
