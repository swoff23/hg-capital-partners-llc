"use client";
import { useRef, useState } from "react";
import { FormField, Input } from "@/components/ui";
import { requestPasswordReset } from "../actions";
import { authInputClass } from "../_components/auth-frame";
import { AuthSubmit } from "../_components/auth-submit";

/** One loose check, the same the server makes (lib/portal/credentials.ts looksLikeEmail): an @ with something either side and a dot after it. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The "Forgot password" form (forms 4.9): a visible label, `noValidate`, and a
 * line on the field when the email is missing or isn't one, so a mistyped
 * address costs no round trip. The answer is the same whether or not the
 * email has a login (see requestPasswordReset).
 */
export function ForgotForm() {
  const [problem, setProblem] = useState<string | undefined>();
  const email = useRef<HTMLInputElement>(null);
  return (
    <form
      action={requestPasswordReset}
      noValidate
      onSubmit={(e) => {
        const typed = String(new FormData(e.currentTarget).get("email") ?? "").trim();
        const line = !typed ? "Enter your email." : !EMAIL.test(typed) ? "Enter an email, like name@example.com." : undefined;
        setProblem(line);
        if (line) {
          e.preventDefault();
          email.current?.focus();
        }
      }}
      className="mt-8 space-y-4 text-left"
    >
      <FormField label="Email" required error={problem}>
        {(p) => (
          <Input
            {...p}
            ref={email}
            name="email"
            type="email"
            autoComplete="username"
            autoFocus
            onChange={() => problem && setProblem(undefined)}
            className={authInputClass}
          />
        )}
      </FormField>
      <AuthSubmit>Email me a link</AuthSubmit>
    </form>
  );
}
