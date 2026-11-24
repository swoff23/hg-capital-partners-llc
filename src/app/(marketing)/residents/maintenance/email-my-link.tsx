"use client";
import { useState, type FormEvent } from "react";
import { publicCtaClass, publicType } from "@/components/public/ui";
import { FormField, Input, SaveError } from "@/components/ui";
import { callAction } from "@/lib/action-result";
import { cn } from "@/lib/utils";
import { emailMyLink } from "./actions";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * One email field and Email me my link. The answer is the same line whatever
 * was typed (section 3.7): the action never says whether anyone matched.
 */
export function EmailMyLink() {
  const [email, setEmail] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    if (!EMAIL.test(email.trim())) {
      setProblem("Enter the email we have on file.");
      return;
    }
    setProblem(null);
    setRefusal(null);
    setPending(true);
    const res = await callAction(() => emailMyLink({ email, honeypot }));
    setPending(false);
    if (res.ok) setSent(true);
    else setRefusal(res.error);
  }

  if (sent) {
    return (
      <p role="status" className={cn(publicType.title, "mt-6 text-foreground")}>
        If that email is on file, your link is on its way.
      </p>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="mt-6 max-w-sm space-y-4">
      <FormField label="Email" error={problem ?? undefined}>
        {(p) => (
          <Input
            {...p}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setProblem(null);
            }}
          />
        )}
      </FormField>
      {/* A field people never see; bots fill it in. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="sr-only" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
      {refusal && <SaveError>{refusal}</SaveError>}
      <button type="submit" disabled={pending} className={publicCtaClass}>
        {pending ? "Sending…" : "Email me my link"}
      </button>
    </form>
  );
}
