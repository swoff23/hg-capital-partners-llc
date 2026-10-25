"use client";
import { useActionState, useEffect, useRef } from "react";
import { login } from "../actions";
import { LOGIN_MESSAGES, LOGIN_START } from "../login-state";
import { Input } from "@/components/ui";
import { AuthError, AuthLabel, AuthNotice, authInputClass } from "./auth-frame";
import { AuthSubmit } from "./auth-submit";
import { PasswordField } from "./password-field";

/**
 * The /login form. A wrong password or a lockout comes back as state rather
 * than a redirect, so the email stays filled in (defaultValue survives
 * React's reset of the form after the action) and focus moves to the
 * password. `next` is the page to go back to, already checked by the page.
 */
/**
 * The email from the last submit. A dropped connection shows the crash screen,
 * whose Try again remounts this form with fresh state; this outlives that, so
 * the email comes back. With JavaScript off it's never used.
 */
const lastTyped = { email: "" };

export function LoginForm({ next, passwordChanged }: { next: string | null; passwordChanged: boolean }) {
  const [state, formAction] = useActionState(login, LOGIN_START);
  const email = state.email || lastTyped.email;
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.error) passwordRef.current?.focus();
  }, [state]);

  return (
    <>
      {state.error ? (
        <AuthError>{LOGIN_MESSAGES[state.error]}</AuthError>
      ) : (
        passwordChanged && <AuthNotice>Password changed. Sign in with the new one.</AuthNotice>
      )}

      <form
        action={formAction}
        onSubmit={(e) => {
          lastTyped.email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
        }}
        className="mt-8 space-y-4 text-left"
      >
        {next && <input type="hidden" name="next" value={next} />}
        <div>
          <AuthLabel htmlFor="login-email">Email</AuthLabel>
          <Input
            id="login-email"
            name="email"
            type="email"
            autoComplete="username"
            required
            autoFocus={!email}
            defaultValue={email}
            className={authInputClass}
          />
        </div>
        <div>
          <AuthLabel htmlFor="login-password">Password</AuthLabel>
          <PasswordField
            ref={passwordRef}
            id="login-password"
            name="password"
            autoComplete="current-password"
            required
            autoFocus={!!email}
          />
        </div>
        <AuthSubmit pendingLabel="Signing in…">Sign in</AuthSubmit>
      </form>
    </>
  );
}
