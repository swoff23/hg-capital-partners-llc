import { firstName } from "@/lib/names";

/**
 * The login details staff send a contractor (the Portal access card on a
 * contractor's page, docs/asana-migration-plan.md §5.1): "Copy message" on a
 * computer, or "Text login details" on a phone through an sms: link, so
 * nothing here sends anything. Three labeled lines and nothing else, the way
 * Connor wants it pasted (Nov 14). Pure; see login-text.test.ts.
 */

export { firstName };

export function loginTextBody(input: { appUrl: string; email: string; password: string }): string {
  const url = `${input.appUrl.replace(/\/+$/, "")}/login`;
  return [
    `Login website: ${url}`,
    `Your Email: ${input.email}`,
    `Your Password: ${input.password}`,
  ].join("\n");
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
