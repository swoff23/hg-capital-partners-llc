/**
 * What counts as an acceptable contractor email and password. Pure; see
 * credentials.test.ts. Problems are codes so a form can round-trip them in
 * `?error=` and show the matching line.
 */

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 200;

export type PasswordProblem = "short" | "long" | "simple" | "email" | "same" | "mismatch" | "wrong-current" | "locked";

export const PASSWORD_MESSAGES: Record<PasswordProblem, string> = {
  short: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
  long: `Use ${MAX_PASSWORD_LENGTH} characters or fewer.`,
  simple: "That password is too easy to guess.",
  email: "Pick a password that isn't your email.",
  same: "Pick a new password, not the current one.",
  mismatch: "The two new passwords don't match.",
  "wrong-current": "Current password is wrong.",
  locked: "Too many tries. Wait 15 minutes.",
};

export function isPasswordProblem(code: unknown): code is PasswordProblem {
  return typeof code === "string" && Object.hasOwn(PASSWORD_MESSAGES, code);
}

/**
 * The strength check for a password someone chooses. Length is what matters
 * most; beyond that it only refuses the obvious: one or two repeated
 * characters, the account's own email, or the password being replaced.
 */
export function checkNewPassword(
  next: string,
  ctx: { confirm?: string; current?: string; email?: string } = {},
): PasswordProblem | null {
  if (next.length < MIN_PASSWORD_LENGTH || next.trim().length < MIN_PASSWORD_LENGTH) return "short";
  if (next.length > MAX_PASSWORD_LENGTH) return "long";
  if (new Set(next.toLowerCase()).size < 4) return "simple";
  if (ctx.email) {
    const lower = next.toLowerCase();
    const email = ctx.email.toLowerCase();
    const local = email.split("@")[0];
    if (lower === email || (local.length >= 4 && lower === local)) return "email";
  }
  if (ctx.current !== undefined && next === ctx.current) return "same";
  if (ctx.confirm !== undefined && next !== ctx.confirm) return "mismatch";
  return null;
}

/**
 * Whether a starting password someone sent is a try at all. An empty one is
 * the form posted unfilled (no script, or a skipped check), not a guess, so
 * it is refused before the sign-in throttle and never spends one of the
 * strikes that lock the account for everyone, /login included.
 */
export function isStartingPasswordTry(current: string): boolean {
  return current.length > 0;
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Loose on purpose: one @, something either side, a dot in the domain, no spaces. */
export function looksLikeEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * What the reset link's form posted. It has one password field, so the
 * password stands as its own confirmation: a `confirm` that is missing or
 * empty falls back to the password, and only a different, non-empty one is a
 * mismatch. (A form posted before the page hydrated, or without script, can
 * carry an empty one, which must not read as a second, different password.)
 */
export function readResetForm(form: FormData): { token: string; password: string; confirm: string } {
  const password = String(form.get("password") ?? "");
  return { token: String(form.get("token") ?? ""), password, confirm: String(form.get("confirm") ?? "") || password };
}
