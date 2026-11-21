import { capitalizedName, mailtoHref } from "@/lib/contacts";
import { EMAIL_INVALID, PHONE_INVALID, readPhone } from "@/lib/contractors/contact-fields";
import { todayYmdEastern, type Ymd } from "@/lib/dates";
import { looksLikeEmail, normalizeEmail } from "@/lib/portal/credentials";

/**
 * A listing's sign-up list (docs/specs/coming-soon.md 3.3 to 3.5): how the
 * Notify me form's fields read, the lines it shows, and the words and files
 * the listing sheet's Waiting section makes from the list. Pure and
 * browser-safe (no zod, no Prisma, nothing server-only), so the form, the
 * server action and the sheet share one copy; see fields.test.ts. The writes
 * are core.ts's.
 */

/* ---------------- The sign-up form ---------------- */

/** In the form's order, so the first problem is the first field on screen (focusFirstInvalid). */
export const WAITLIST_FIELDS = ["firstName", "email", "phone"] as const;
export type WaitlistField = (typeof WAITLIST_FIELDS)[number];

/** What the form holds: each field's text as typed. */
export type WaitlistInput = Record<WaitlistField, string>;

/** What joinWaitlist is sent: the fields, the listing, and the honeypot's text. */
export type JoinWaitlistInput = WaitlistInput & { listingId: string; honeypot?: string };

/** One sign-up as stored: the name tidied, the email lowercased, the phone in its display form or null. */
export type WaitlistSignUp = { firstName: string; email: string; phone: string | null };

export type WaitlistProblems = Partial<Record<WaitlistField, string>>;

export const FIRST_NAME_MAX = 60;
/** Longer than any number with a short note ("716-555-1234 (cell)"); past it, it isn't a phone number. */
export const PHONE_MAX = 40;

export const FIRST_NAME_REQUIRED = "Enter your first name.";
// The contractor and tenant forms' lines, word for word. Both fit 288px at 14px (PHONE_INVALID is about 260px).
export { EMAIL_INVALID, PHONE_INVALID };

// The form's line above Notify me when the sign-up is turned down. Each fits 288px at 14px.
export const TOO_MANY_FROM_YOU = "Too many sign-ups. Try again in an hour.";
export const TOO_MANY_TODAY = "Too many sign-ups right now. Try again later.";
export const NOT_TAKING_SIGN_UPS = "This home isn't taking sign-ups anymore.";
/** In place of GENERIC_ERROR, whose "reload the page" would lose what was typed. OFFLINE_ERROR stays as it is. */
export const JOIN_FAILED = "Couldn't add you to the list. Try again.";

/** On one line with single spaces, at most 60 characters, each all-lowercase word capitalized ("dana" to "Dana"). */
export function cleanFirstName(raw: string): string {
  const name = [...raw.replace(/\s+/g, " ").trim()].slice(0, FIRST_NAME_MAX).join("").trim();
  return capitalizedName(name) ?? name;
}

/** Trimmed and lowercased, so the same person on the same home is one row. */
export function cleanEmail(raw: string): string {
  return normalizeEmail(raw);
}

/** readPhone's display form ("716-555-1234"), null when blank, undefined when it can't be dialed. */
export function cleanPhone(raw: string): string | null | undefined {
  const text = raw.trim();
  if (!text) return null;
  if (text.length > PHONE_MAX) return undefined;
  // The cap holds for the stored display form too (it can run 2 longer, with dashes), so Undo reads every stored row back.
  const phone = readPhone(text)?.phone;
  return phone && phone.length <= PHONE_MAX ? phone : undefined;
}

/**
 * The line under one field, or null when it reads. A blank first name or
 * email is a problem; a blank phone isn't. The form calls it when a field
 * with text loses focus, on Notify me for every field, and as the person
 * types once a line shows.
 */
export function waitlistFieldProblem(field: WaitlistField, raw: string): string | null {
  switch (field) {
    case "firstName":
      return cleanFirstName(raw) ? null : FIRST_NAME_REQUIRED;
    case "email":
      // mailtoHref also refuses , ; < >, which would split the pasted BCC list into a bogus address.
      return looksLikeEmail(cleanEmail(raw)) && mailtoHref(cleanEmail(raw)) !== null ? null : EMAIL_INVALID;
    case "phone":
      return cleanPhone(raw) === undefined ? PHONE_INVALID : null;
  }
}

/** Every field's problem, in the form's order; empty when the sign-up reads. */
export function waitlistProblems(input: WaitlistInput): WaitlistProblems {
  const problems: WaitlistProblems = {};
  for (const field of WAITLIST_FIELDS) {
    const problem = waitlistFieldProblem(field, input[field] ?? "");
    if (problem) problems[field] = problem;
  }
  return problems;
}

/** The sign-up as stored, or every field's problem. The server action reads it with the same rules the form ran. */
export function readSignUp(input: WaitlistInput): { ok: true; data: WaitlistSignUp } | { ok: false; problems: WaitlistProblems } {
  const problems = waitlistProblems(input);
  if (Object.keys(problems).length > 0) return { ok: false, problems };
  return { ok: true, data: { firstName: cleanFirstName(input.firstName), email: cleanEmail(input.email), phone: cleanPhone(input.phone ?? "") ?? null } };
}

/** The hidden field a person never sees: any text in it means a bot, which gets a quiet success and nothing saved. */
export function honeypotFilled(value: string | null | undefined): boolean {
  return !!value;
}

/* ---------------- The listing's Waiting section ---------------- */

/** One person on the list as the listing sheet shows it, newest first. `signedUp` is the Buffalo day they signed up. */
export type WaitlistRow = { id: string; firstName: string; email: string; phone: string | null; signedUp: Ymd };

/**
 * A row Remove took off the list, as removeWaitlistEntry returns it and
 * restoreWaitlistEntry takes it back for Undo: `createdAt` (an ISO instant)
 * is kept whole, so the restored row keeps its place and its day.
 */
export type RemovedWaitlistEntry = {
  id: string;
  listingId: string;
  firstName: string;
  email: string;
  phone: string | null;
  createdAt: string;
};

/** A stored row as the sheet shows it, its day read in Buffalo. */
export function toWaitlistRow(entry: { id: string; firstName: string; email: string; phone: string | null; createdAt: Date | string }): WaitlistRow {
  return {
    id: entry.id,
    firstName: entry.firstName,
    email: entry.email,
    phone: entry.phone,
    signedUp: todayYmdEastern(new Date(entry.createdAt)),
  };
}

/** Copy emails: every address on the list, ready for Gmail's BCC ("a@x.com, b@y.com"). */
export function waitlistEmails(rows: readonly Pick<WaitlistRow, "email">[]): string {
  return rows.map((r) => r.email).join(", ");
}

export const WAITLIST_CSV_HEADER = ["First name", "Email", "Phone", "Signed up"] as const;
/** The Download's file type, for `new Blob([waitlistCsv(rows)], { type: WAITLIST_CSV_TYPE })`. */
export const WAITLIST_CSV_TYPE = "text/csv;charset=utf-8";

/**
 * A spreadsheet treats a cell starting with these as a formula and runs it,
 * so such a cell gets a leading apostrophe and reads as text. Tab and carriage
 * return are on OWASP's list with the four the spec names.
 */
const FORMULA_START = /^[=+\-@\t\r]/;

/** One cell: guarded against formulas, then quoted when it holds a quote, comma or line break (RFC 4180). */
function csvCell(value: string | null): string {
  const raw = value ?? "";
  const text = FORMULA_START.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Download: the list as a .csv (First name, Email, Phone, Signed up as
 * YYYY-MM-DD), rows in the order given, CRLF line ends. It starts with a
 * byte-order mark, so Excel reads an accented name as UTF-8 (Google Sheets
 * and Numbers skip it).
 */
export function waitlistCsv(rows: readonly WaitlistRow[]): string {
  const lines = [WAITLIST_CSV_HEADER.join(","), ...rows.map((r) => [r.firstName, r.email, r.phone, r.signedUp].map(csvCell).join(","))];
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** The file's name, after the home: "56-tamarack-st-upper-sign-ups.csv" for "56 Tamarack St" and "Upper". */
export function waitlistCsvName(street: string, unitLabel: string): string {
  const slug = `${street} ${unitLabel}`
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug ? `${slug}-sign-ups.csv` : "sign-ups.csv";
}

/** The listing row's clause after the rent ("$1,450/mo · 3 waiting"); null when nobody is on the list. */
export function waitingClause(count: number): string | null {
  return count > 0 ? `${count} waiting` : null;
}

/**
 * Delete listing's confirm body: what goes with the listing. The photo-only
 * lines are today's ("Its 4 photos go too."); with people waiting, they're
 * named ("Its 4 photos and the 3 people waiting go too.", "The 3 people
 * waiting go too.", "Dana, who's waiting, goes too."). Undefined when
 * nothing goes with it.
 */
export function deleteListingBody(photoCount: number, waiting: readonly Pick<WaitlistRow, "firstName">[]): string | undefined {
  const photos = photoCount === 1 ? "1 photo" : `${photoCount} photos`;
  if (waiting.length === 0) return photoCount > 0 ? `Its ${photos} ${photoCount === 1 ? "goes" : "go"} too.` : undefined;
  const people = waiting.length === 1 ? `${waiting[0].firstName}, who's waiting,` : `the ${waiting.length} people waiting`;
  if (photoCount > 0) return `Its ${photos} and ${people} go too.`;
  return waiting.length === 1 ? `${people} goes too.` : `The ${waiting.length} people waiting go too.`;
}

/** Copy emails' toast: "3 emails copied", "1 email copied". */
export function emailsCopiedToast(count: number): string {
  return count === 1 ? "1 email copied" : `${count} emails copied`;
}
export const EMAILS_COPY_FAILED = "Couldn't copy the emails.";
/** A row menu's Copy email. */
export const EMAIL_COPIED = "Email copied";
export const EMAIL_COPY_FAILED = "Couldn't copy the email.";

/** Remove from list's toast, with Undo: "Dana removed from the list". */
export function removedToast(firstName: string): string {
  return `${firstName} removed from the list`;
}
