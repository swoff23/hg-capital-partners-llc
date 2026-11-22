"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { login } from "../actions";
import { LOGIN_MESSAGES, LOGIN_START } from "../login-state";
import { Avatar } from "@/components/avatar";
import { FormField, Input, SaveError } from "@/components/ui";
import { cn } from "@/lib/utils";
import { AuthNotice, authInputClass, authLinkClass } from "./auth-frame";
import { AuthSubmit } from "./auth-submit";
import { PasswordField } from "./password-field";

/**
 * The /login form (forms 4.9). Both fields have visible labels, "Email" and
 * "Password", through `FormField`, and the form is `noValidate`, so a missing
 * field says what to enter on the field itself and the browser's bubble never
 * shows. A wrong password or a lockout comes back as state rather than a
 * redirect, so the email stays filled in (defaultValue survives React's reset
 * of the form after the action) and focus moves to the password; the reason
 * is one `--destructive` line above Sign in. `next` is the page to go back to,
 * already checked by the page.
 *
 * `known` is Welcome back's login (docs/specs/contractor-scheduled-date.md
 * section 12): the email is already known, so it's shown beside their mark,
 * not typed (Etsy's and Viator's Welcome back on Mobbin), and goes with the
 * form as the username a password manager matches.
 */
/**
 * The email from the last submit. A dropped connection shows the crash screen,
 * whose Try again remounts this form with fresh state; this outlives that, so
 * the email comes back. With JavaScript off it's never used.
 */
const lastTyped = { email: "" };

export function LoginForm({
  next,
  passwordChanged,
  known = null,
}: {
  next: string | null;
  passwordChanged: boolean;
  /** Welcome back's login; `switchForm` is the id of the form "Use a different email" submits. */
  known?: { name: string; email: string; switchForm: string } | null;
}) {
  const [state, formAction] = useActionState(login, LOGIN_START);
  const email = known?.email ?? (state.email || lastTyped.email);
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
        {known ? (
          <div className="flex min-w-0 items-center gap-2.5">
            <Avatar name={known.name} email={known.email} size={28} outline />
            <div className="min-w-0">
              <p className="truncate text-meta text-foreground">{known.email}</p>
              {/* Its own form (forms can't nest): ends the job email's session so someone else can sign in. */}
              <button type="submit" form={known.switchForm} className={cn(authLinkClass, "-my-2 underline underline-offset-3")}>
                Use a different email
              </button>
            </div>
            {/* The username a password manager fills the password for; read-only, never typed. */}
            <input type="email" name="email" autoComplete="username" value={known.email} readOnly hidden />
          </div>
        ) : (
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
        )}
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
