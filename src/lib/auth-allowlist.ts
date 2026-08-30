/**
 * Only these Google accounts may sign in. Add a row here + create the matching User
 * (npm run migrate users) when someone joins.
 */
export const ALLOWED_EMAILS = [
  "connoraswofford@gmail.com",
  "connor@investorbase.com",
  "pieter@queencitycorp.com",
].map((e) => e.toLowerCase());

export function isAllowedEmail(email: string | null | undefined): boolean {
  return !!email && ALLOWED_EMAILS.includes(email.toLowerCase());
}

export const SUPABASE_CONFIGURED =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
