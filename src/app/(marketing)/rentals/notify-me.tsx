"use client";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Bell } from "lucide-react";
import { Button as AriaButton, DialogTrigger } from "react-aria-components";
import { PhotoThumb } from "@/components/photo-thumb";
import { publicCtaClass, publicLinkHover, publicType } from "@/components/public/ui";
import { Sheet } from "@/components/sheet";
import { SpotArt } from "@/components/spot-art";
import { Button, FormField, Input, SaveError } from "@/components/ui";
import { GENERIC_ERROR, callAction } from "@/lib/action-result";
import { focusFirstInvalid, returnFocusAfterSave } from "@/lib/focus";
import { cn } from "@/lib/utils";
import {
  FIRST_NAME_MAX,
  JOIN_FAILED,
  WAITLIST_FIELDS,
  waitlistFieldProblem,
  waitlistProblems,
  type WaitlistField,
  type WaitlistInput,
} from "@/lib/waitlist/fields";
import { joinWaitlist } from "./actions";

const BLANK: WaitlistInput = { firstName: "", email: "", phone: "" };

type Lines = Partial<Record<WaitlistField, string>>;

/**
 * Notify me on a coming-soon card (docs/specs/coming-soon.md 3.3): a button
 * that opens a small form on HG's Sheet (a centered dialog from md, a bottom
 * sheet below it) and turns into a thank-you once the person is on the list.
 * The title is the home; `pill` ("Coming in January") is the first line of the
 * body.
 *
 * The state lives here, above the Sheet, because the footer and `dirty` are
 * Sheet props. It starts over each time the sheet opens. Errors follow
 * docs/specs/forms-editing.md (Timing): nothing is red before the first try, a
 * bad email or phone shows on leaving a field that holds text, a missing first
 * name or email shows on Notify me with focus on the first bad field, and once
 * a line shows it re-checks as the person types.
 *
 * The thank-you follows the contractor's Mark done payoff
 * (`app/(portal)/p/jobs/[id]/_components/job-actions.tsx`): the home's photo,
 * or the envelope art with none, and a heading that takes focus, since the
 * button that was pressed is gone.
 */
export function NotifyMe({
  listingId,
  title,
  pill,
  photoUrl,
}: {
  listingId: string;
  /** The street and unit, "56 Tamarack St, Upper": the sheet's title and the button's accessible name. */
  title: string;
  /** The card's pill, "Coming in January". */
  pill: string;
  /** The home's first photo, for the thank-you. */
  photoUrl: string | null;
}) {
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<WaitlistInput>(BLANK);
  const [honeypot, setHoneypot] = useState("");
  // Fields whose line may show: one left with text, or every field once Notify me was pressed.
  const [shown, setShown] = useState<Partial<Record<WaitlistField, true>>>({});
  // A line the server sent for a field, until that field is typed in.
  const [served, setServed] = useState<Lines>({});
  const [pending, setPending] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [sentName, setSentName] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  // Counts the visits: X and Esc close mid-request, so an answer that lands after a reopen is dropped.
  const visit = useRef(0);

  function onOpenChange(next: boolean) {
    if (next) {
      visit.current += 1;
      setValues(BLANK);
      setHoneypot("");
      setShown({});
      setServed({});
      setPending(false);
      setRefusal(null);
      setSentName(null);
    }
    setOpen(next);
  }

  const lines: Lines = {};
  for (const f of WAITLIST_FIELDS) {
    const line = (shown[f] ? waitlistFieldProblem(f, values[f]) : null) ?? served[f];
    if (line) lines[f] = line;
  }

  function change(field: WaitlistField, value: string) {
    setValues((v) => ({ ...v, [field]: value }));
    setServed((s) => ({ ...s, [field]: undefined }));
  }

  // A format error shows on leaving a field that holds text; a blank field waits for Notify me.
  function leave(field: WaitlistField) {
    if (values[field].trim()) setShown((s) => ({ ...s, [field]: true }));
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setShown({ firstName: true, email: true, phone: true });
    if (Object.keys(waitlistProblems(values)).length > 0) {
      // The lines are drawn by the next frame; the first bad field takes focus.
      const form = e.currentTarget;
      requestAnimationFrame(() => focusFirstInvalid(form));
      return;
    }
    setRefusal(null);
    setPending(true);
    // A dropped connection rejects the call; callAction turns it into OFFLINE_ERROR.
    const thisVisit = visit.current;
    const result = await callAction(() => joinWaitlist({ listingId, ...values, honeypot }));
    if (thisVisit !== visit.current) return;
    if (result.ok) {
      setSentName(result.data.firstName);
    } else {
      const fieldErrors = result.fieldErrors ?? {};
      const hasFieldLines = WAITLIST_FIELDS.some((f) => fieldErrors[f]);
      // Field lines say it under the field, so the line above Notify me stays quiet and focus goes to the bad field.
      setRefusal(hasFieldLines ? null : result.error === GENERIC_ERROR ? JOIN_FAILED : result.error);
      setServed(Object.fromEntries(WAITLIST_FIELDS.filter((f) => fieldErrors[f]).map((f) => [f, fieldErrors[f]])));
      if (hasFieldLines) requestAnimationFrame(() => focusFirstInvalid(formRef.current));
    }
    setPending(false);
  }

  // A busy button is disabled, and the browser drops focus from it to the page, where Esc and Tab no
  // longer reach the sheet. A refused sign-up puts focus back on it (the same as FormSheet).
  const wasPending = useRef(false);
  useEffect(() => {
    const was = wasPending.current;
    wasPending.current = pending;
    if (sentName === null && returnFocusAfterSave({ was, pending, isOpen: open, active: document.activeElement, body: document.body })) {
      submitRef.current?.focus({ preventScroll: true });
    }
  }, [pending, open, sentName]);

  const dirty = sentName === null && (pending || WAITLIST_FIELDS.some((f) => values[f] !== ""));

  return (
    <DialogTrigger isOpen={open} onOpenChange={onOpenChange}>
      <AriaButton
        aria-label={`Notify me about ${title}`}
        className={cn(
          publicType.meta,
          "inline-flex w-fit cursor-pointer items-center gap-1 rounded-sm text-foreground pointer-coarse:min-h-11",
          publicLinkHover,
        )}
      >
        <Bell aria-hidden="true" className="size-4 stroke-[1.5]" />
        Notify me
      </AriaButton>
      <Sheet
        title={title}
        surface="public"
        // Something typed: the backdrop does nothing. X and Esc close at once, since the form holds three short fields.
        dirty={dirty}
        footer={
          sentName === null ? (
            <div className="space-y-3">
              {/* w-0 min-w-full: a refusal that arrives takes the sheet's width and can't resize it. */}
              {refusal && <SaveError className="w-0 min-w-full">{refusal}</SaveError>}
              <Button ref={submitRef} type="submit" form={formId} pending={pending} className={cn(publicCtaClass, "w-full")}>
                Notify me
              </Button>
            </div>
          ) : (
            <Button className={cn(publicCtaClass, "w-full")} onClick={() => onOpenChange(false)}>
              Done
            </Button>
          )
        }
      >
        {sentName === null ? (
          <SignUpFields
            formId={formId}
            formRef={formRef}
            pill={pill}
            values={values}
            lines={lines}
            honeypot={honeypot}
            onHoneypot={setHoneypot}
            onChange={change}
            onLeave={leave}
            onSubmit={submit}
          />
        ) : (
          <ThankYou firstName={sentName} title={title} photoUrl={photoUrl} />
        )}
      </Sheet>
    </DialogTrigger>
  );
}

function SignUpFields({
  formId,
  formRef,
  pill,
  values,
  lines,
  honeypot,
  onHoneypot,
  onChange,
  onLeave,
  onSubmit,
}: {
  formId: string;
  formRef: React.RefObject<HTMLFormElement | null>;
  pill: string;
  values: WaitlistInput;
  lines: Lines;
  honeypot: string;
  onHoneypot: (value: string) => void;
  onChange: (field: WaitlistField, value: string) => void;
  onLeave: (field: WaitlistField) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
}) {
  // Focus goes to the first name once the dialog has made its own focus move (the keyboard rises on a phone).
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => first.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <form ref={formRef} id={formId} noValidate onSubmit={onSubmit} className="space-y-4 p-4">
      <p className="text-meta text-muted-foreground">{pill}</p>
      {/* Honeypot: invisible and out of the tab order for real people, as on the move-in form. */}
      <input
        type="text"
        name="website"
        value={honeypot}
        onChange={(e) => onHoneypot(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        className="sr-only"
        aria-hidden="true"
      />
      <FormField label="First name" required error={lines.firstName} fitLine>
        {(p) => (
          <Input
            {...p}
            ref={first}
            name="firstName"
            autoComplete="given-name"
            maxLength={FIRST_NAME_MAX}
            value={values.firstName}
            onChange={(e) => onChange("firstName", e.target.value)}
            onBlur={() => onLeave("firstName")}
          />
        )}
      </FormField>
      <FormField label="Email" required error={lines.email} fitLine>
        {(p) => (
          <Input
            {...p}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            value={values.email}
            onChange={(e) => onChange("email", e.target.value)}
            onBlur={() => onLeave("email")}
          />
        )}
      </FormField>
      <FormField label="Phone" optional error={lines.phone} fitLine>
        {(p) => (
          <Input
            {...p}
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={values.phone}
            onChange={(e) => onChange("phone", e.target.value)}
            onBlur={() => onLeave("phone")}
          />
        )}
      </FormField>
    </form>
  );
}

/** The payoff: the home's photo (the envelope art with none), the person's own name, and what happens next. */
function ThankYou({ firstName, title, photoUrl }: { firstName: string; title: string; photoUrl: string | null }) {
  // Notify me is gone: move focus here, so the heading is read out and Esc still closes the sheet.
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <div role="status" className="flex flex-col items-center px-6 pb-6 pt-8 text-center">
      {photoUrl ? (
        <PhotoThumb size="full" src={photoUrl} alt={`Front of ${title}`} sizes="320px" className="w-full max-w-xs motion-safe:animate-pop-in" />
      ) : (
        <SpotArt name="request-sent" className="motion-safe:animate-pop-in" />
      )}
      <h2 ref={heading} tabIndex={-1} className="mt-4 max-w-full wrap-break-word text-title text-balance text-foreground outline-none">
        {`You're on the list, ${firstName}!`}
      </h2>
      <p className="mt-2 max-w-xs text-pretty text-body text-fg-2">We&apos;ll reach out when it&apos;s ready.</p>
    </div>
  );
}
