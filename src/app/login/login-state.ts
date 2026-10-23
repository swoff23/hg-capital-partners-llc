/**
 * What a failed sign-in hands back to the /login form (login() in
 * actions.ts, through useActionState in _components/login-form.tsx). The
 * typed email comes back so the form keeps it; it never goes in the URL.
 */
export type LoginError = "bad" | "locked";

export interface LoginState {
  error: LoginError | null;
  email: string;
}

export const LOGIN_START: LoginState = { error: null, email: "" };

export const LOGIN_MESSAGES: Record<LoginError, string> = {
  bad: "Wrong email or password.",
  locked: "Too many failed attempts. Try again in 15 minutes.",
};
