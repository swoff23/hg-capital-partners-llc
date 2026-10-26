"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { login } from "../actions";
import { LOGIN_MESSAGES, LOGIN_START } from "../login-state";
import { FormField, Input, SaveError } from "@/components/ui";
import { AuthNotice, authInputClass } from "./auth-frame";
import { AuthSubmit } from "./auth-submit";
import { PasswordField } from "./password-field";

/**
 * The /login form (forms 4.9). Both fields have visible labels, "Email" and
 * "Password", through `FormField`, and the form is `noValidate`, so a missing
 * field says what to enter on the field itself and the browser's bubble never
 * shows. A wrong password or a lockout comes back as state rather than a
 * redirect, so the email stays filled in (defaultValue survives React's reset
 * of the form after the action) and focus moves to the password; the reason
 * is one `--danger` line above Sign in. `next` is the page to go back to,
 * already checked by the page.
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
  const emailRef = useRef<HTMLInputElement>(null);
  // What's missing, shown once Sign in was pressed with it missing.
  const [missing, setMissing] = useState<{ email?: string; password?: string }>({});

  useEffect(() => {
    if (state.error) passwordRef.current?.focus();
  }, [state]);

  return (
    <>
      {passwordChanged && !state.error && <AuthNotice>Password changed. Sign in with the new one.</AuthNotice>}

      <form
        action={formAction}
        noValidate
        onSubmit={(e) => {
          const data = new FormData(e.currentTarget);
          const typed = String(data.get("email") ?? "").trim();
          lastTyped.email = typed;
          const problems = {
            ...(typed ? {} : { email: "Enter your email." }),
            ...(String(data.get("password") ?? "") ? {} : { password: "Enter your password." }),
          };
          setMissing(problems);
          if (problems.email || problems.password) {
            e.preventDefault();
            (problems.email ? emailRef : passwordRef).current?.focus();
          }
        }}
        className="mt-8 space-y-4 text-left"
      >
        {next && <input type="hidden" name="next" value={next} />}
        <FormField label="Email" required error={missing.email}>
          {(p) => (
            <Input
              {...p}
              ref={emailRef}
              name="email"
              type="email"
              autoComplete="username"
              autoFocus={!email}
              defaultValue={email}
              onChange={() => missing.email && setMissing((m) => ({ ...m, email: undefined }))}
              className={authInputClass}
            />
          )}
        </FormField>
        <FormField label="Password" required error={missing.password}>
          {(p) => (
            <PasswordField
              {...p}
              ref={passwordRef}
              name="password"
              autoComplete="current-password"
              autoFocus={!!email}
              onChange={() => missing.password && setMissing((m) => ({ ...m, password: undefined }))}
            />
          )}
        </FormField>
        {/* The refusal, one line right above the button it answers (forms 2.0). */}
        {state.error && <SaveError>{LOGIN_MESSAGES[state.error]}</SaveError>}
        <AuthSubmit>Sign in</AuthSubmit>
      </form>
    </>
  );
}
