"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { PasswordField } from "@/app/login/_components/password-field";
import { AuthSubmit } from "@/app/login/_components/auth-submit";
import { AuthError, authInputClass } from "@/app/login/_components/auth-frame";
import { FormField, Input } from "@/components/ui";
import { MIN_PASSWORD_LENGTH } from "@/lib/portal/credentials";
import { createAccount, openInvite, type JoinState } from "./actions";

const START: JoinState = { error: null, field: null };

/**
 * The sign-up form for a personal invite (email and password) or the shared link (name, mobile, email and
 * password). A refusal comes back through `useActionState` rather than a redirect, so what was typed is still
 * there, and its line sits on the field it's about, with focus there. A personal invite is marked Opened from here,
 * after the page loads in a browser, since a link preview fetches the page without one.
 */
export function JoinForm({ token, kind, email }: { token: string; kind: "invite" | "signup"; email: string }) {
  const [state, formAction] = useActionState(createAccount, START);
  // Kept as typed: the form resets itself after the action, back to these.
  const [typed, setTyped] = useState({ fullName: "", phone: "", email, password: "" });
  // The answer whose line was typed past: each answer is its own object, so the next refusal shows again.
  const [dismissed, setDismissed] = useState<JoinState | null>(null);
  const refs = {
    fullName: useRef<HTMLInputElement>(null),
    phone: useRef<HTMLInputElement>(null),
    email: useRef<HTMLInputElement>(null),
    password: useRef<HTMLInputElement>(null),
  };

  useEffect(() => {
    if (kind === "invite") openInvite(token).catch(() => {});
  }, [kind, token]);

  const problem = state.error && state !== dismissed ? state : null;
  const line = (field: keyof typeof refs) => (problem?.field === field ? problem.error! : undefined);

  useEffect(() => {
    if (state.field && state.field !== "form") refs[state.field].current?.focus();
    // refs are stable objects
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const change = (field: keyof typeof typed) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setTyped((t) => ({ ...t, [field]: e.target.value }));
    if (problem?.field === field) setDismissed(state);
  };

  return (
    <form action={formAction} noValidate className="mt-8 space-y-4 text-left">
      <input type="hidden" name="token" value={token} />
      {kind === "signup" && (
        <>
          <FormField label="Name" required error={line("fullName")}>
            {(p) => (
              <Input {...p} ref={refs.fullName} name="fullName" autoComplete="name" defaultValue={typed.fullName} onChange={change("fullName")} className={authInputClass} />
            )}
          </FormField>
          <FormField label="Mobile" required error={line("phone")}>
            {(p) => (
              <Input
                {...p}
                ref={refs.phone}
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                defaultValue={typed.phone}
                onChange={change("phone")}
                className={authInputClass}
              />
            )}
          </FormField>
        </>
      )}
      <FormField label="Email" required error={line("email")}>
        {(p) => (
          <Input
            {...p}
            ref={refs.email}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            defaultValue={typed.email}
            onChange={change("email")}
            className={authInputClass}
          />
        )}
      </FormField>
      <FormField label="Password" required helper={`At least ${MIN_PASSWORD_LENGTH} characters.`} error={line("password")}>
        {(p) => (
          <PasswordField {...p} ref={refs.password} name="password" autoComplete="new-password" defaultValue={typed.password} onChange={change("password")} />
        )}
      </FormField>
      {problem?.field === "form" && <AuthError>{problem.error}</AuthError>}
      <AuthSubmit>Create account</AuthSubmit>
    </form>
  );
}
