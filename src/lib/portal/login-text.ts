import { firstName } from "@/lib/names";

/**
 * The text message staff send a contractor with their new login (the Portal
 * access card on a contractor's page, docs/asana-migration-plan.md §5.1).
 * It goes out from the staff member's own phone through an sms: link, so
 * nothing here sends anything. Pure; see login-text.test.ts.
 */

export { firstName };

export function loginTextBody(input: {
  contactName: string;
  staffName: string;
  appUrl: string;
  email: string;
  password: string;
}): string {
  const hi = firstName(input.contactName);
  const from = firstName(input.staffName);
  const url = `${input.appUrl.replace(/\/+$/, "")}/login`;
  return [
    `Hi${hi ? ` ${hi}` : ""}, it's ${from || "HG"}.`,
    `Your HG jobs: ${url}.`,
    `Email: ${input.email}.`,
    `Starting password: ${input.password}.`,
    "You'll pick your own when you sign in.",
  ].join(" ");
}

/**
 * An sms: link with the body filled in. The number keeps only digits and a
 * leading +; with none, the phone asks who to send it to. "?&body=" opens
 * prefilled on both iOS and Android.
 */
export function smsHref(phone: string | null | undefined, body: string): string {
  const raw = (phone ?? "").trim();
  const number = (raw.startsWith("+") ? "+" : "") + raw.replace(/\D/g, "");
  return `sms:${number === "+" ? "" : number}?&body=${encodeURIComponent(body)}`;
}
