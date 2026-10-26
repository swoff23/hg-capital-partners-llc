"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Combobox } from "@/components/combobox";
import { FormSheet } from "@/components/form-sheet";
import { AutosizeTextarea } from "@/components/inline-field";
import { FormField, Input, Section } from "@/components/ui";
import { useDraft } from "@/components/use-draft";
import { useRun } from "@/components/use-run";
import { inlineProblem } from "@/lib/inline-edit";
import { HG_TIME_ZONE } from "@/lib/dates";
import { createContractor } from "../actions";

/** What the sheet holds, as typed. Trades are a list here and join with " / " on the way out. */
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

/** Where each field of the form lives in the action's input. */
const FIELDS = Object.keys(BLANK) as (keyof Values)[];

function problemsOf(v: Values): Partial<Record<keyof Values, string>> {
  const found: Partial<Record<keyof Values, string>> = {};
  if (!v.fullName.trim()) found.fullName = "Enter a name.";
  const phone = inlineProblem("phone", v.phone);
  if (phone) found.phone = phone;
  const email = inlineProblem("email", v.email);
  if (email) found.email = email;
  return found;
}

/**
 * The New contractor sheet (forms 4.6): the name, then what's known about
 * how to reach them and what they do, saved as a new Contact. Phone, email
 * and address are one group, "Contact (optional)", and company, trades,
 * billing and availability another, "Work (optional)", so only the name asks
 * for anything. Trades are picked from the ones already in the directory or
 * typed, and saved in the directory's "Plumbing / HVAC" text. It opens over the
 * Contractors list from a click (an intercepting route) and as a page of its
 * own from a pasted link; either way the same form, and closing it goes back
 * to the list. "Create more" keeps the sheet open with the fields cleared. The
 * unsaved form is kept in this browser for a week ("Draft from 2:10 PM").
 */
export function NewContractorSheet({ trades }: { trades: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [values, setValues] = useState<Values>(BLANK);
  const [more, setMore] = useState(false);
  const [tried, setTried] = useState(false);
  const run = useRun();
  const { restored, savedAt, clear } = useDraft("new-contractor", values);
  // The draft found when the sheet opened goes back into the form once, as it arrives.
  const [applied, setApplied] = useState(false);
  if (restored && !applied) {
    setApplied(true);
    setValues({ ...BLANK, ...restored });
  }

  const problems = problemsOf(values);
  const dirty = JSON.stringify(values) !== JSON.stringify(BLANK);

  /**
   * Back to where it opened: the list behind a click, where this sheet is an
   * intercepted route and Back closes it; the directory for a pasted link or
   * a reload, where this page is the first one the document loaded.
   */
  function leave() {
    const loadedHere = (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined)?.name === window.location.href;
    if (loadedHere) router.replace("/contractors");
    else router.back();
  }

  function change<K extends keyof Values>(field: K, value: Values[K]) {
    run.reset();
    setValues((v) => ({ ...v, [field]: value }));
  }

  function submit() {
    setTried(true);
    if (Object.keys(problems).length > 0) return;
    const input = {
      ...Object.fromEntries(FIELDS.filter((f) => f !== "trades").map((f) => [f, values[f] as string])),
      trades: values.trades.join(" / "),
    };
    run.run(() => createContractor(input), {
      failure: "inline",
      succeeded: (created) => {
        clear();
        run.toast({
          message: `${created.fullName} added`,
          action: { label: "Open", onAction: () => router.push(`/contractors/${created.id}`) },
        });
        if (more) {
          // The next one starts at once: fields clear, the sheet stays.
          setValues(BLANK);
          setTried(false);
        } else {
          setOpen(false);
          // After the sheet slides out.
          window.setTimeout(leave, 180);
        }
      },
    });
  }

  const shown = (field: keyof Values) => (tried ? problems[field] : undefined) ?? run.fieldErrors?.[field];

  return (
    <FormSheet
      title="New contractor"
      isOpen={open}
      onOpenChange={(o) => {
        if (o) return setOpen(true);
        setOpen(false);
        window.setTimeout(leave, 180);
      }}
      onSubmit={submit}
      primary="Create contractor"
      pending={run.pending}
      dirty={dirty}
      values={values}
      createMore={{ isSelected: more, onChange: setMore }}
      discardTitle="Discard the new contractor?"
      leaveTitle="Leave without saving the new contractor?"
      error={run.error && !run.fieldErrors ? run.error : undefined}
      fieldErrors={run.fieldErrors}
      fullHeight
    >
      {restored && savedAt && (
        <p className="-mt-1 flex items-baseline gap-2 text-meta text-fg-3">
          <span>Draft from {savedAt.toLocaleTimeString("en-US", { timeZone: HG_TIME_ZONE, hour: "numeric", minute: "2-digit" })}</span>
          <button
            type="button"
            className="text-fg-2 underline underline-offset-3 hover:text-fg-1"
            onClick={() => {
              clear();
              setValues(BLANK);
              setTried(false);
            }}
          >
            Clear
          </button>
        </p>
      )}

      <FormField label="Name" required error={shown("fullName")}>
        {(p) => (
          <Input {...p} value={values.fullName} autoComplete="off" autoCapitalize="words" onChange={(e) => change("fullName", e.target.value)} />
        )}
      </FormField>

      <Section as="h3" title="Contact (optional)">
        <div className="space-y-4">
          <FormField label="Phone" error={shown("phone")}>
            {(p) => <Input {...p} type="text" inputMode="tel" autoComplete="off" value={values.phone} onChange={(e) => change("phone", e.target.value)} />}
          </FormField>
          <FormField label="Email" error={shown("email")}>
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
          <FormField label="Mailing address" error={shown("mailingAddress")}>
            {(p) => (
              <AutosizeTextarea {...p} rows={2} value={values.mailingAddress} onChange={(e) => change("mailingAddress", e.target.value)} />
            )}
          </FormField>
        </div>
      </Section>

      <Section as="h3" title="Work (optional)">
        <div className="space-y-4">
          <FormField label="Company" error={shown("company")}>
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
            isInvalid={!!shown("trades")}
            errorMessage={shown("trades")}
          />
          <FormField label="Billing" helper="How they're paid. No account numbers." error={shown("billingInfo")}>
            {(p) => <Input {...p} autoComplete="off" value={values.billingInfo} onChange={(e) => change("billingInfo", e.target.value)} />}
          </FormField>
          <FormField label="Availability" error={shown("availability")}>
            {(p) => <Input {...p} autoComplete="off" value={values.availability} onChange={(e) => change("availability", e.target.value)} />}
          </FormField>
        </div>
      </Section>

      <FormField label="Notes" optional error={shown("comments")}>
        {(p) => <AutosizeTextarea {...p} rows={3} value={values.comments} onChange={(e) => change("comments", e.target.value)} />}
      </FormField>
    </FormSheet>
  );
}

