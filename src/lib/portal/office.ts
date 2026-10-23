import { telHref } from "@/lib/contacts";

/**
 * The number behind the phone button on a contractor's job page. Connor sets
 * it ("+17165551234" form); while it's empty the button doesn't show, so a
 * contractor is never handed a wrong number.
 */
export const OFFICE_PHONE_E164: string = "";

/** The tel: link, or null while the number isn't set. */
export function officeTelHref(phone: string = OFFICE_PHONE_E164): string | null {
  return telHref(phone);
}
