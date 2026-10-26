"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Combobox } from "@/components/combobox";
import { CreateForm } from "@/components/create-form";
import { AutosizeTextarea } from "@/components/inline-field";
import { useToast } from "@/components/toast";
import { FormField, Input, Section } from "@/components/ui";
import type { FieldErrors } from "@/lib/action-result";
import { inlineProblem } from "@/lib/inline-edit";
import { createContractor } from "../actions";

/** What the form holds, as typed. Trades are a list here and join with " / " on the way out. */
type Values = {
  fullName: string;
  phone: string;
  email: string;
  mailingAddress: string;
  company: string;
  trades: string[];
  billingInfo: string;
  availability: string;
  comments: string;
};

const BLANK: Values = {
  fullName: "",
  phone: "",
  email: "",
  mailingAddress: "",
  company: "",
  trades: [],
  billingInfo: "",
  availability: "",
  comments: "",
};

/** The fields that show their own line; each is a key of the action's input. */
const FIELDS = Object.keys(BLANK) as (keyof Values)[];

/** The lines the form checks before sending: a name, and a phone and email that read. */
function problemsOf(v: Values): FieldErrors | null {
  const found: FieldErrors = {};
  if (!v.fullName.trim()) found.fullName = "Enter a name.";
  const phone = inlineProblem("phone", v.phone);
  if (phone) found.phone = phone;
  const email = inlineProblem("email", v.email);
  if (email) found.email = email;
  return Object.keys(found).length > 0 ? found : null;
}

/** The action's input: every field as typed, the trades in the directory's "Plumbing / HVAC" text. */
function inputOf(v: Values) {
  return {
    ...Object.fromEntries(FIELDS.filter((f) => f !== "trades").map((f) => [f, v[f] as string])),
    trades: v.trades.join(" / "),
  };
}

/**
 * New contractor (forms 4.6): the name, then what's known about how to reach
 * them and what they do, saved as a new Contact. Phone, email and address are
 * one group, "Contact (optional)", and company, trades, billing and
 * availability another, "Work (optional)", so only the name asks for
 * anything. Trades are picked from the ones already in the directory or
 * typed. On `CreateForm`, like New task, deal and property: a sheet over the
 * Contractors list from a click (the intercepting route in the `@modal` slot)
 * and the same form flat on `/contractors/new` from a pasted link or a
 * reload, with the draft, the discard question and Create more. A success
 * toasts "Dana Ruiz added" with Open, and goes back to the list.
 */
export function NewContractorForm({ variant, trades }: { variant: "sheet" | "page"; trades: string[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [values, setValues] = useState<Values>(BLANK);

  return (
    <CreateForm<Values, { id: string; fullName: string }>
      variant={variant}
      title="New contractor"
      primary="Create contractor"
      discardTitle="Discard the new contractor?"
      leaveTitle="Leave the new contractor?"
      backHref="/contractors"
      createMore
      fullHeight
      values={values}
      // Over a blank form, so a draft kept before a field existed still has every field.
      onRestore={(draft) => setValues({ ...BLANK, ...draft })}
      onReset={() => setValues(BLANK)}
      draftKey="new-contractor"
      fields={FIELDS}
      check={() => problemsOf(values)}
      // The fields are controlled (trades are a list), so the action gets the values, not the posted form.
      action={() => createContractor(inputOf(values))}
      onCreated={(created, more) => {
        toast({
          message: `${created.fullName} added`,
          action: { label: "Open", onAction: () => router.push(`/contractors/${created.id}`) },
        });
        if (more) return;
        if (variant === "sheet") router.back();
        else router.replace("/contractors");
      }}
    >
      {({ errors, clear }) => {
        function change<K extends keyof Values>(field: K, value: Values[K]) {
          clear(field);
          setValues((v) => ({ ...v, [field]: value }));
        }
        return (
          <>
            <FormField label="Name" required error={errors.fullName}>
              {(p) => (
                <Input
                  {...p}
                  name="fullName"
                  value={values.fullName}
                  autoComplete="off"
                  autoCapitalize="words"
                  onChange={(e) => change("fullName", e.target.value)}
                />
              )}
            </FormField>

            <Section as="h3" title="Contact (optional)">
              <div className="space-y-4">
                <FormField label="Phone" error={errors.phone}>
                  {(p) => (
                    <Input {...p} type="text" inputMode="tel" autoComplete="off" value={values.phone} onChange={(e) => change("phone", e.target.value)} />
                  )}
                </FormField>
                <FormField label="Email" error={errors.email}>
                  {(p) => (
                    <Input
                      {...p}
                      type="text"
                      inputMode="email"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      autoComplete="off"
                      value={values.email}
                      onChange={(e) => change("email", e.target.value)}
                    />
                  )}
                </FormField>
                <FormField label="Mailing address" error={errors.mailingAddress}>
                  {(p) => (
                    <AutosizeTextarea {...p} rows={2} value={values.mailingAddress} onChange={(e) => change("mailingAddress", e.target.value)} />
                  )}
                </FormField>
              </div>
            </Section>

            <Section as="h3" title="Work (optional)">
              <div className="space-y-4">
                <FormField label="Company" error={errors.company}>
                  {(p) => <Input {...p} autoComplete="off" value={values.company} onChange={(e) => change("company", e.target.value)} />}
                </FormField>
                <Combobox
                  multiple
                  allowCustom
                  label="Trades"
                  items={trades}
                  value={values.trades}
                  onChange={(next) => change("trades", next)}
                  placeholder="Add a trade"
                  isInvalid={!!errors.trades}
                  errorMessage={errors.trades}
                />
                <FormField label="Billing" helper="How they're paid. No account numbers." error={errors.billingInfo}>
                  {(p) => <Input {...p} autoComplete="off" value={values.billingInfo} onChange={(e) => change("billingInfo", e.target.value)} />}
                </FormField>
                <FormField label="Availability" error={errors.availability}>
                  {(p) => <Input {...p} autoComplete="off" value={values.availability} onChange={(e) => change("availability", e.target.value)} />}
                </FormField>
              </div>
            </Section>

            <FormField label="Notes" optional error={errors.comments}>
              {(p) => <AutosizeTextarea {...p} rows={3} value={values.comments} onChange={(e) => change("comments", e.target.value)} />}
            </FormField>
          </>
        );
      }}
    </CreateForm>
  );
}
