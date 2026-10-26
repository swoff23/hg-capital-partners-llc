import { cleanTrades } from "@/lib/contacts";
import { looksLikeEmail, normalizeEmail } from "@/lib/portal/credentials";

/**
 * What staff can change on a Contact (the Contact section's Edit on a
 * contractor's page) and how each field reads before it's written. Pure; see
 * contact-fields.test.ts. src/lib/contractors/service.ts writes the result,
 * and the editor runs the same check in the browser before it sends.
 *
 * Only the columns staff type. The W-9 and insurance links, `active` and the
 * portal login aren't here. An empty field saves as null; the name can't be
 * empty. Field names are whitelisted, so a form can post whatever it likes.
 */

/** In the editor's order, so the first problem is the first one on screen. */
export const CONTACT_FIELDS = [
  "fullName",
  "company",
  "trades",
  "phone",
  "email",
  "mailingAddress",
  "billingInfo",
  "availability",
  "tenantFixes",
  "comments",
] as const;
export type ContactField = (typeof CONTACT_FIELDS)[number];

/** The columns a patch writes. `phoneE164` goes with `phone`, always together. */
export type ContactData = {
  fullName?: string;
  company?: string | null;
  trades?: string | null;
  phone?: string | null;
  phoneE164?: string | null;
  email?: string | null;
  mailingAddress?: string | null;
  billingInfo?: string | null;
  availability?: string | null;
  tenantFixes?: boolean;
  comments?: string | null;
};

export type ContactProblem = { field: ContactField; message: string };
export type ReadContact = { ok: true; data: ContactData } | ({ ok: false } & ContactProblem);

type TextField = Exclude<ContactField, "tenantFixes">;

const MAX_LENGTH: Record<TextField, number> = {
  fullName: 120,
  company: 200,
  trades: 200,
  phone: 40,
  email: 254,
  mailingAddress: 500,
  billingInfo: 200,
  availability: 200,
  comments: 10_000,
};

export const NAME_REQUIRED = "Enter a name.";
export const EMAIL_INVALID = "Enter a full email, like name@example.com.";
export const PHONE_INVALID = "Enter the full number, like 716-555-1234.";

/** The line under a field past its limit. It sits under that field, so it doesn't name it. */
export function tooLong(max: number): string {
  return `Use ${max.toLocaleString("en-US")} characters or fewer.`;
}

/** Line endings as "\n" and the ends trimmed: what a textarea hands back on any platform. */
function tidy(raw: string): string {
  return raw.replace(/\r\n?/g, "\n").trim();
}

/**
 * A phone number as the directory shows it, and its E.164 copy for the
 * Text and Call links. A US number (10 digits, or 11 with the leading 1)
 * reads "716-555-1234", the way the spreadsheet import wrote them, and is
 * "+17165551234" in E.164. A number typed with a + and its country code is
 * kept as typed. A note after the number (an extension, "(cell)") stays in
 * the display copy only, whole. Null for a number that can't be dialed:
 * the links take 10 to 15 digits, and a +1 number is exactly 11.
 */
export function readPhone(raw: string): { phone: string | null; phoneE164: string | null } | null {
  const text = tidy(raw).replace(/\s+/g, " ");
  if (!text) return { phone: null, phoneE164: null };
  // The number ends at its last digit before the first letter or #: "716-555-1234 (cell)", "716-555-1234 ext 2".
  const cut = text.search(/[\p{L}#]/u);
  const head = cut === -1 ? text : text.slice(0, cut);
  const end = head.search(/\d\D*$/) + 1;
  const main = text.slice(0, end);
  // The note, without the separator before it: "716-555-1234, cell" keeps "cell".
  const rest = text.slice(end).replace(/^[\s,;:-]+/, "");
  const digits = main.replace(/\D/g, "");
  const plus = main.startsWith("+");
  let us: string | null = null;
  if (digits.length === 11 && digits.startsWith("1")) us = digits.slice(1);
  else if (!plus && digits.length === 10) us = digits;
  if (us) {
    const shown = `${us.slice(0, 3)}-${us.slice(3, 6)}-${us.slice(6)}`;
    return { phone: rest ? `${shown} ${rest}` : shown, phoneE164: `+1${us}` };
  }
  if (plus && !digits.startsWith("1") && digits.length >= 10 && digits.length <= 15) {
    return { phone: text, phoneE164: `+${digits}` };
  }
  return null;
}

export type ContactProblems = Partial<Record<ContactField, string>>;
export type ReadNewContact = { ok: true; data: ContactData & { fullName: string } } | { ok: false; problems: ContactProblems };

/**
 * A new contractor from the New contractor sheet (forms 4.6): the name is
 * required, everything else is optional, and each field reads by the same
 * rules as an edit. Every problem comes back, keyed by field, so the sheet
 * marks each one and focuses the first. Blank fields are left out, not
 * stored as empty text. Pure; see contact-fields.test.ts.
 */
export function readNewContact(input: Partial<Record<string, string | null>>): ReadNewContact {
  const problems: ContactProblems = {};
  const data: ContactData = {};
  for (const field of CONTACT_FIELDS) {
    const raw = input[field];
    if (raw === undefined || raw === null) {
      if (field === "fullName") problems.fullName = NAME_REQUIRED;
      continue;
    }
    if (field !== "fullName" && raw.trim() === "") continue;
    const read = readContactPatch({ [field]: raw });
    if (!read.ok) problems[field] = read.message;
    else Object.assign(data, read.data);
  }
  if (Object.keys(problems).length > 0 || !data.fullName) return { ok: false, problems };
  return { ok: true, data: { ...data, fullName: data.fullName } };
}

/**
 * The patch as the columns it writes, or the first problem in the editor's
 * order. Only the fields present in `patch` are read; anything else in it
 * is ignored.
 */
export function readContactPatch(patch: Partial<Record<string, string | null>>): ReadContact {
  const has = (k: string) => Object.prototype.hasOwnProperty.call(patch, k);
  const data: ContactData = {};
  for (const field of CONTACT_FIELDS) {
    if (!has(field)) continue;
    const raw = patch[field] ?? "";
    if (field === "tenantFixes") {
      data.tenantFixes = raw.trim() === "yes";
      continue;
    }
    // A name stays on one line with single spaces; other fields keep their line breaks.
    const text = field === "fullName" ? tidy(raw).replace(/\s+/g, " ") : tidy(raw);
    if (text.length > MAX_LENGTH[field]) {
      return { ok: false, field, message: tooLong(MAX_LENGTH[field]) };
    }
    switch (field) {
      case "fullName":
        if (!text) return { ok: false, field, message: NAME_REQUIRED };
        data.fullName = text;
        break;
      case "email": {
        const email = normalizeEmail(text);
        if (email && !looksLikeEmail(email)) return { ok: false, field, message: EMAIL_INVALID };
        data.email = email || null;
        break;
      }
      case "phone": {
        const phone = readPhone(text);
        if (!phone) return { ok: false, field, message: PHONE_INVALID };
        data.phone = phone.phone;
        data.phoneE164 = phone.phoneE164;
        break;
      }
      case "trades":
        // The same trade twice ("HVAC / HVAC") is kept once, as the directory shows it.
        data.trades = cleanTrades(text);
        break;
      default:
        data[field] = text || null;
    }
  }
  return { ok: true, data };
}
