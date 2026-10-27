"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { PasswordField } from "@/app/login/_components/password-field";
import { AuthSubmit } from "@/app/login/_components/auth-submit";
import { FormField, SaveError } from "@/components/ui";
import { MIN_PASSWORD_LENGTH, PASSWORD_MESSAGES, type PasswordProblem } from "@/lib/portal/credentials";
import { chooseOwnPassword, type FirstPasswordState } from "../../actions";

const START: FirstPasswordState = { error: null };

/** The one place each refusal belongs: the starting password, the new one, or neither (too many tries). */
const FIELD: Record<PasswordProblem, "current" | "password" | "form"> = {
  "wrong-current": "current",
  short: "password",
  long: "password",
  simple: "password",
  email: "password",
  same: "password",
  mismatch: "password",
  locked: "form",
};

/** Lines specific to this page, over the shared ones. */
const WORDS: Partial<Record<PasswordProblem, string>> = {
  "wrong-current": "That starting password is wrong.",
  same: "Pick a new password, not the starting one.",
};

/**
 * The contractor's first password (forms 4.9): "Starting password" and "New
 * password", both with Show, since the starting one is typed off a text
 * message on a phone. The rule is the new field's helper. A refusal comes
 * back through `useActionState` rather than a redirect, so what was typed is
 * still there, and its line sits on the field it's about, with focus there.
 * Interim until the one-time link (G1A-001) removes the starting password.
 */
export function WelcomeForm({ email, next }: { email: string; next: string | null }) {
  const [state, formAction] = useActionState(chooseOwnPassword, START);
  // Kept as typed: the form resets itself after the action, back to these.
  const [typed, setTyped] = useState({ current: "", password: "" });
  // The answer whose line was typed past: each answer is its own object, so the next refusal shows again.
  const [dismissed, setDismissed] = useState<FirstPasswordState | null>(null);
  // Set when Save was pressed with the starting password empty, like the sign-in form's missing fields.
  const [missingCurrent, setMissingCurrent] = useState(false);
  const current = useRef<HTMLInputElement>(null);
  const password = useRef<HTMLInputElement>(null);

  const problem = state.error && state !== dismissed ? state.error : null;
  const where = problem ? FIELD[problem] : null;
  const line = (field: "current" | "password") => {
    if (field === "current" && missingCurrent) return "Enter your starting password.";
    return problem && where === field ? (WORDS[problem] ?? PASSWORD_MESSAGES[problem]) : undefined;
  };

  useEffect(() => {
    if (!state.error) return;
    (FIELD[state.error] === "current" ? current : password).current?.focus();
  }, [state]);

  return (
    <form
      action={formAction}
      noValidate
      onSubmit={(e) => {
        // An empty starting password isn't a try: stopped here, it never reaches the sign-in throttle's strikes.
        const empty = !String(new FormData(e.currentTarget).get("current") ?? "");
        setMissingCurrent(empty);
        if (empty) {
          e.preventDefault();
          current.current?.focus();
        }
      }}
      className="mt-8 space-y-4 text-left"
    >
      {next && <input type="hidden" name="next" value={next} />}
      {/* Lets password managers file the new password under the right login. */}
      <input type="email" name="username" value={email} autoComplete="username" readOnly hidden />
      <FormField label="Starting password" required error={line("current")}>
        {(p) => (
          <PasswordField
            {...p}
            ref={current}
            name="current"
            autoComplete="current-password"
            autoFocus
            defaultValue={typed.current}
            onChange={(e) => {
              setTyped((t) => ({ ...t, current: e.target.value }));
              setMissingCurrent(false);
              if (where === "current") setDismissed(state);
            }}
          />
        )}
      </FormField>
      <FormField label="New password" required helper={`At least ${MIN_PASSWORD_LENGTH} characters.`} error={line("password")}>
        {(p) => (
          <PasswordField
            {...p}
            ref={password}
            name="password"
            autoComplete="new-password"
            defaultValue={typed.password}
            onChange={(e) => {
              setTyped((t) => ({ ...t, password: e.target.value }));
              if (where === "password") setDismissed(state);
            }}
          />
        )}
      </FormField>
      {problem && where === "form" && <SaveError>{PASSWORD_MESSAGES[problem]}</SaveError>}
      <AuthSubmit>Save password</AuthSubmit>
    </form>
  );
}
