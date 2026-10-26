"use client";
import { useRef, useState } from "react";
import { FormField } from "@/components/ui";
import { MIN_PASSWORD_LENGTH, PASSWORD_MESSAGES, checkNewPassword } from "@/lib/portal/credentials";
import { AuthSubmit } from "../_components/auth-submit";
import { PasswordField } from "../_components/password-field";

/**
 * The reset link's form (forms 4.9): one "New password" field with Show and
 * the rule as its helper, "At least 10 characters.". The rule is checked
 * before anything is posted, so a short password never costs a round trip
 * (and never spends the single-use token). The post stays a plain POST to
 * /login/reset/submit (see its route for why); the one password also goes as
 * `confirm`, the second copy the old form asked for, which the server still
 * compares. `refusal` is the server's reason when it sent the person back.
 */
export function ResetForm({ token, refusal }: { token: string; refusal?: string }) {
  const [shownRefusal, setRefusal] = useState(refusal);
  const [problem, setProblem] = useState<string | undefined>();
  const [password, setPassword] = useState("");
  const field = useRef<HTMLInputElement>(null);
  const line = problem ?? shownRefusal;

  return (
    // A plain POST to a route handler, not a server action: see submit/route.ts.
    <form
      method="post"
      action="/login/reset/submit"
      noValidate
      onSubmit={(e) => {
        const code = checkNewPassword(password);
        if (code) {
          // Stopped here: nothing is posted, so the link isn't spent.
          e.preventDefault();
          setProblem(PASSWORD_MESSAGES[code]);
          field.current?.focus();
        }
      }}
      className="mt-8 space-y-4 text-left"
    >
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="confirm" value={password} />
      <FormField label="New password" required helper={`At least ${MIN_PASSWORD_LENGTH} characters.`} error={line}>
        {(p) => (
          <PasswordField
            {...p}
            ref={field}
            name="password"
            autoComplete="new-password"
            autoFocus
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setProblem(undefined);
              setRefusal(undefined);
            }}
          />
        )}
      </FormField>
      {/* native: a second tap would spend the single-use token again and land on "This link has expired". */}
      <AuthSubmit native>Save password</AuthSubmit>
    </form>
  );
}
