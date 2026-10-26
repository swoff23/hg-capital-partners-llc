"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { ActionBar } from "@/components/action-bar";
import { DateField } from "@/components/due-date-picker";
import { useHoldLeave } from "@/components/leave-guard";
import { Meter } from "@/components/meter";
import type { OptionItem } from "@/components/option-list";
import { SegmentedControl } from "@/components/segmented-control";
import { Select } from "@/components/select";
import { Sheet } from "@/components/sheet";
import { SpotArt } from "@/components/spot-art";
import { useToast } from "@/components/toast";
import { useDraft } from "@/components/use-draft";
import { Button, FormField, Input, Section, Textarea, textLinkClass } from "@/components/ui";
import { publicCtaClass, publicSecondaryClass, publicType } from "@/components/public/ui";
import { callAction } from "@/lib/action-result";
import { fmtDay, type Ymd } from "@/lib/dates";
import type { MoveInFormSchema, MoveInSection } from "@/lib/move-in-form-types";
import { firstName } from "@/lib/names";
import { shortAddress } from "@/lib/normalize";
import { townOf } from "@/lib/picker-options-shape";
import { cn } from "@/lib/utils";
import { submitMoveInInspection } from "./actions";
import {
  RATINGS,
  blankAnswers,
  blankInstance,
  buildSteps,
  firstIncomplete,
  flaggedItems,
  formVersion,
  hasProgress,
  instanceName,
  itemKey,
  nextLabel,
  reconcile,
  stepLine,
  stepName,
  stepProblems,
  toSubmission,
  type Answers,
  type Instance,
  type Problems,
  type Rating,
} from "./steps";

const RATING_OPTIONS = RATINGS.map((r) => ({ key: r, label: r }));

/** The page's own words for what happens once it's sent. */
const AFTER_SEND = "We'll follow up if anything needs attention.";

type Property = { id: string; address: string; units: string[] };

/**
 * The public move-in report, a step at a time (forms 2.14, 3.5 A): About you,
 * a room each, then Review, with the docked bar holding Back and Next (and
 * "Send move-in report" on the last). A resident walks the unit room by room,
 * often switching to the camera and back, so each answer is kept on this
 * device (`useDraft`) and coming back asks "Pick up where you left off?".
 * Next checks only the step you're on and puts a line on what's missing; the
 * editor's Required is enforced, so a required room needs every item rated
 * (N/A covers what doesn't apply). Back never loses an answer.
 */
export function MoveInForm({
  schema,
  properties,
  today,
}: {
  schema: MoveInFormSchema;
  properties: Property[];
  /** Today in Buffalo, "YYYY-MM-DD", the date of the inspection until the resident changes it. */
  today: Ymd;
}) {
  const steps = buildSteps(schema);
  const version = formVersion(schema);
  const [a, setA] = useState<Answers>(() => blankAnswers(schema, today));
  const [step, setStep] = useState(0);
  // Next was pressed on this step: its lines show, and update as the answers get right.
  const [tried, setTried] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [sending, startSend] = useTransition();
  const [refusal, setRefusal] = useState<string | null>(null);
  const [sent, setSent] = useState<{ name: string; copied: boolean; day: string } | null>(null);
  const { toast } = useToast();

  const region = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  const property = properties.find((p) => p.id === a.propertyId);
  const here = steps[Math.min(step, steps.length - 1)];
  const problems: Problems = tried ? stepProblems(here, a, schema, property) : {};

  // Every answer goes to this device, and a reload or a back swipe offers it back.
  const { restored, clear } = useDraft(`move-in:${version}`, { a, step });
  const [resume, setResume] = useState<{ a: Answers; at: number } | null>(null);
  // The draft is looked at once, the render it shows up, and asked about if there's anything in it.
  const [looked, setLooked] = useState<typeof restored>(null);
  if (restored && restored !== looked) {
    setLooked(restored);
    const back = reconcile(restored.a, schema);
    if (hasProgress(back, schema, today)) {
      const next = firstIncomplete(steps, back, schema, properties.find((p) => p.id === back.propertyId));
      setResume({ a: back, at: next === -1 ? steps.length - 1 : next });
    }
  }

  const dirty = !sent && hasProgress(a, schema, today);
  // Leaving is safe, since the answers stay here, but the page says so before it goes.
  useHoldLeave(dirty ? { title: "Leave your move-in report?", stay: "Keep going" } : null);

  // The bar shows while the report is on screen, not over the checklist above it.
  useEffect(() => {
    const el = region.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [sent]);

  // A new step starts at its heading, which a screen reader reads out.
  const arrived = useRef(false);
  useEffect(() => {
    if (!arrived.current) {
      arrived.current = true;
      return;
    }
    heading.current?.focus({ preventScroll: true });
    region.current?.scrollIntoView({ block: "start" });
  }, [step]);

  const patch = (p: Partial<Answers>) => setA((cur) => ({ ...cur, ...p }));
  const patchInstance = (key: string, i: number, fn: (inst: Instance) => Instance) =>
    setA((cur) => ({ ...cur, rooms: { ...cur.rooms, [key]: cur.rooms[key].map((inst, j) => (j === i ? fn(inst) : inst)) } }));

  function focusFirstLine() {
    requestAnimationFrame(() => {
      const first = region.current?.querySelector<HTMLElement>('[data-invalid="true"] button, [data-invalid="true"] input, [aria-invalid="true"]');
      first?.focus({ preventScroll: true });
      first?.scrollIntoView({ block: "center" });
    });
  }

  function next() {
    if (sending) return;
    if (step >= steps.length - 1) return send();
    if (Object.keys(stepProblems(here, a, schema, property)).length > 0) {
      setTried(true);
      focusFirstLine();
      return;
    }
    setTried(false);
    setStep(step + 1);
  }

  function back() {
    setTried(false);
    setStep(Math.max(0, step - 1));
  }

  function send() {
    // Next let each step through, but a draft or an Edit can leave one behind: it's the first thing shown.
    const open = firstIncomplete(steps, a, schema, property);
    if (open !== -1) {
      setStep(open);
      setTried(true);
      focusFirstLine();
      return;
    }
    setRefusal(null);
    startSend(async () => {
      // A dropped connection rejects the call instead of returning an error. Left uncaught it reaches
      // the error boundary, which replaces the form and loses every answer; callAction turns it into a message.
      const result = await callAction(() => submitMoveInInspection(toSubmission(a, schema, property, honeypot)));
      if (!result.ok) {
        setRefusal(result.error);
        return;
      }
      clear();
      setSent({ name: firstName(a.name) || a.name.trim(), copied: result.data.copied, day: fmtDay(today, { year: "auto", now: today }) });
    });
  }

  // The payoff: the move-in line art, the resident's own name, who it went to and what happens next.
  if (sent) {
    return (
      <div role="status" className="flex flex-col items-start gap-5 border-t border-line pt-8">
        <SpotArt name="move-in-sent" />
        <div>
          <p className={cn(publicType.heading, "text-fg-1")}>Thanks, {sent.name}!</p>
          <p className={cn(publicType.meta, "mt-2 text-fg-3")}>
            Sent to HG Capital on {sent.day}.{sent.copied ? " We emailed you a copy." : ""}
          </p>
          <p className={cn(publicType.meta, "mt-1 text-fg-3")}>{AFTER_SEND}</p>
        </div>
      </div>
    );
  }

  const label = nextLabel(steps, step);

  return (
    // Room under the last field, so the docked bar never covers it.
    <div ref={region} className="pb-28">
      {/* Honeypot: invisible and unreachable by tab order for real users. */}
      <input
        type="text"
        name="company"
        value={honeypot}
        onChange={(e) => setHoneypot(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        className="sr-only"
        aria-hidden="true"
      />

      <div className="space-y-2">
        <p className="text-meta text-fg-3">{stepLine(steps, step)}</p>
        <Meter value={step + 1} max={steps.length} label="Move-in report progress" valueText={stepLine(steps, step)} spring />
      </div>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          next();
        }}
        className="mt-6 space-y-6 text-left"
      >
        {here.kind === "about" && (
          <AboutStep a={a} patch={patch} properties={properties} property={property} problems={problems} headingRef={heading} />
        )}
        {here.kind === "room" && (
          <RoomStep
            section={schema.sections.find((s) => s.key === here.key)!}
            instances={a.rooms[here.key] ?? []}
            problems={problems}
            headingRef={heading}
            onItem={(i, item, p) =>
              patchInstance(here.key, i, (inst) => ({ ...inst, items: { ...inst.items, [item]: { ...inst.items[item], ...p } } }))
            }
            onLocation={(i, location) => patchInstance(here.key, i, (inst) => ({ ...inst, location }))}
            onAdd={() => setA((cur) => ({ ...cur, rooms: { ...cur.rooms, [here.key]: [...cur.rooms[here.key], blankInstance(schema.sections.find((s) => s.key === here.key)!)] } }))}
            onRemove={(i) => {
              const section = schema.sections.find((s) => s.key === here.key)!;
              const gone = a.rooms[here.key][i];
              const name = instanceName(section, i, gone.location);
              setA((cur) => ({ ...cur, rooms: { ...cur.rooms, [here.key]: cur.rooms[here.key].filter((_, j) => j !== i) } }));
              toast({
                message: `${name} removed`,
                action: {
                  label: "Undo",
                  onAction: () =>
                    setA((cur) => {
                      const list = [...cur.rooms[here.key]];
                      list.splice(Math.min(i, list.length), 0, gone);
                      return { ...cur, rooms: { ...cur.rooms, [here.key]: list } };
                    }),
                },
              });
            }}
          />
        )}
        {here.kind === "review" && (
          <ReviewStep
            schema={schema}
            a={a}
            patch={patch}
            headingRef={heading}
            property={property}
            onEdit={(key) => {
              setTried(false);
              setStep(steps.findIndex((s) => s.kind === "room" && s.key === key));
            }}
          />
        )}
        {refusal && (
          <p role="alert" className="text-meta text-danger">
            {refusal}
          </p>
        )}
      </form>

      {inView && (
        <ActionBar
          // The report's column on the page, so Back and Next sit under the fields they move between.
          contentClassName="max-w-320 sm:px-8 lg:px-10"
          rowClassName="max-w-2xl lg:justify-start"
          onPrimary={next}
          secondary={
            step > 0 && (
              <Button type="button" variant="secondary" className={cn(publicSecondaryClass, "shrink-0")} onClick={back} disabled={sending}>
                Back
              </Button>
            )
          }
          primary={
            <Button type="button" className={cn(publicCtaClass, "min-w-0 flex-1 lg:max-w-60")} pending={sending} onClick={next}>
              {label}
            </Button>
          }
        />
      )}

      <Sheet
        title="Pick up where you left off?"
        isOpen={resume !== null}
        // Esc and a tap outside keep the answers: Start over is the one button that throws them away.
        onOpenChange={(open) => {
          if (!open && resume) goOn();
        }}
        surface="public"
        footer={
          <div className="flex flex-col gap-2 md:flex-row-reverse">
            <Button className={cn(publicCtaClass, "md:flex-1")} onClick={goOn}>
              Continue
            </Button>
            <Button
              variant="secondary"
              className={cn(publicSecondaryClass, "md:flex-1")}
              onClick={() => {
                clear();
                setResume(null);
              }}
            >
              Start over
            </Button>
          </div>
        }
      >
        <p className="p-4 text-body text-fg-2">{resume ? `${stepName(steps[resume.at])} is next.` : ""}</p>
      </Sheet>
    </div>
  );

  function goOn() {
    if (!resume) return;
    setA(resume.a);
    setStep(resume.at);
    setResume(null);
  }
}

/* ---------------- About you ---------------- */

function AboutStep({
  a,
  patch,
  properties,
  property,
  problems,
  headingRef,
}: {
  a: Answers;
  patch: (p: Partial<Answers>) => void;
  properties: Property[];
  property: Property | undefined;
  problems: Problems;
  headingRef: React.RefObject<HTMLDivElement | null>;
}) {
  const options: OptionItem[] = properties.map((p) => ({
    id: p.id,
    label: shortAddress(p.address),
    searchText: p.address,
    description: townOf(p.address) || undefined,
  }));
  const units: OptionItem[] = (property?.units ?? []).map((u) => ({ id: u, label: u }));
  return (
    <Section as="h3" title={<StepTitle headingRef={headingRef}>About you</StepTitle>}>
      <div className="space-y-4">
        <FormField label="Your name" error={problems.name} required>
          {(p) => (
            <Input
              {...p}
              name="name"
              autoComplete="name"
              value={a.name}
              onChange={(e) => patch({ name: e.target.value })}
              className="placeholder:text-pub-faint"
            />
          )}
        </FormField>
        <FormField label="Your email" error={problems.email} helper="We email you a copy of the report" required>
          {(p) => (
            <Input
              {...p}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              value={a.email}
              onChange={(e) => patch({ email: e.target.value })}
              className="placeholder:text-pub-faint"
            />
          )}
        </FormField>
        <div data-invalid={problems.propertyId ? "true" : undefined}>
          <Select
            label="Property"
            items={options}
            value={a.propertyId || null}
            onChange={(id) => patch({ propertyId: id ?? "", unitLabel: "" })}
            placeholder="Choose your property"
            searchLabel="Search properties"
            isRequired
            isInvalid={!!problems.propertyId}
            errorMessage={problems.propertyId}
            surface="public"
          />
        </div>
        {units.length > 1 && (
          <div data-invalid={problems.unitLabel ? "true" : undefined}>
            <Select
              label="Unit"
              items={units}
              value={a.unitLabel || null}
              onChange={(u) => patch({ unitLabel: u ?? "" })}
              placeholder="Choose your unit"
              isRequired
              isInvalid={!!problems.unitLabel}
              errorMessage={problems.unitLabel}
              surface="public"
            />
          </div>
        )}
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-meta font-medium text-fg-2">Date of inspection</span>
          <DateField
            label="Date of inspection"
            value={a.date}
            onChange={(date) => patch({ date: date ?? "" })}
            allowNone={false}
            isInvalid={!!problems.date}
            surface="public"
          />
          {problems.date && <p className="truncate text-meta text-danger">{problems.date}</p>}
        </div>
      </div>
    </Section>
  );
}

/** The step's heading, focusable so a new step starts there: `outline-none`, since the focus is for a screen reader. */
function StepTitle({ headingRef, children }: { headingRef: React.RefObject<HTMLDivElement | null>; children: React.ReactNode }) {
  return (
    <div ref={headingRef} tabIndex={-1} className="outline-none">
      {children}
    </div>
  );
}

/* ---------------- A room ---------------- */

function RoomStep({
  section,
  instances,
  problems,
  headingRef,
  onItem,
  onLocation,
  onAdd,
  onRemove,
}: {
  section: MoveInSection;
  instances: Instance[];
  problems: Problems;
  headingRef: React.RefObject<HTMLDivElement | null>;
  onItem: (instance: number, item: string, patch: Partial<{ rating: Rating | ""; comment: string }>) => void;
  onLocation: (instance: number, location: string) => void;
  onAdd: () => void;
  onRemove: (instance: number) => void;
}) {
  // The heading of the instance Add another just made takes focus once it has rendered.
  const added = useRef<HTMLParagraphElement | null>(null);
  const wantsFocus = useRef(false);
  useEffect(() => {
    if (!wantsFocus.current) return;
    wantsFocus.current = false;
    added.current?.focus();
  }, [instances.length]);

  return (
    <Section
      as="h3"
      title={
        <StepTitle headingRef={headingRef}>
          {section.label}
          {section.minCount === 0 && <span className="ml-2 text-meta font-normal text-fg-3">(optional)</span>}
        </StepTitle>
      }
      actions={
        section.repeatable &&
        instances.length < section.maxCount && (
          // The room stays in the accessible name; the visible label is short, so the header fits at 320.
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              wantsFocus.current = true;
              onAdd();
            }}
            aria-label={`Add another ${section.label.toLowerCase()}`}
          >
            <Plus aria-hidden="true" className="size-4 stroke-[1.5]" />
            Add another
          </Button>
        )
      }
    >
      <div className="space-y-4">
        {instances.map((inst, i) => (
          <div key={i} className={cn(i > 0 && "border-t border-line pt-4")}>
            {section.repeatable && (
              <div className="mb-1 flex items-center gap-2">
                <p
                  ref={i === instances.length - 1 ? added : undefined}
                  tabIndex={-1}
                  className="shrink-0 text-label text-fg-1 outline-none"
                >
                  {section.label} {i + 1}
                </p>
                {section.hasLocation && (
                  <Input
                    value={inst.location}
                    onChange={(e) => onLocation(i, e.target.value)}
                    // The heading names the room and its number; the label keeps both for a screen reader.
                    placeholder="e.g. Upstairs"
                    aria-label={`${section.label} ${i + 1} location`}
                    maxLength={80}
                    className="min-w-0 flex-1 placeholder:text-pub-faint"
                  />
                )}
                {i > 0 && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => onRemove(i)} className="shrink-0">
                    Remove
                  </Button>
                )}
              </div>
            )}
            <div className="divide-y divide-line">
              {section.items.map((item) => {
                const answer = inst.items[item.key] ?? { rating: "", comment: "" };
                const line = problems[itemKey(section.key, i, item.key)];
                const flagged = answer.rating === "Fair" || answer.rating === "Poor";
                return (
                  <div key={item.key} data-invalid={line ? "true" : undefined} className="space-y-2 py-3">
                    {/* Below 640 every item's control sits under its label, from 640 beside it: the width decides, not the label's length. */}
                    <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                      <span className="text-body text-fg-1">{item.label}</span>
                      <SegmentedControl
                        aria-label={`${item.label} condition`}
                        options={RATING_OPTIONS}
                        size="md"
                        fullWidth="below-sm"
                        value={answer.rating || null}
                        // Tapping the chosen rating leaves it; to change an answer, tap another one.
                        onChange={(rating) => onItem(i, item.key, { rating })}
                      />
                    </div>
                    {line && <p className="truncate text-meta text-danger">{line}</p>}
                    {/* Said only where there's something to say: after Fair or Poor. */}
                    {flagged && (
                      <FormField label="What's wrong with it?">
                        {(p) => (
                          <Input
                            {...p}
                            value={answer.comment}
                            onChange={(e) => onItem(i, item.key, { comment: e.target.value })}
                            maxLength={500}
                            autoComplete="off"
                            className="placeholder:text-pub-faint"
                          />
                        )}
                      </FormField>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ---------------- Review ---------------- */

function ReviewStep({
  schema,
  a,
  patch,
  headingRef,
  property,
  onEdit,
}: {
  schema: MoveInFormSchema;
  a: Answers;
  patch: (p: Partial<Answers>) => void;
  headingRef: React.RefObject<HTMLDivElement | null>;
  property: Property | undefined;
  onEdit: (sectionKey: string) => void;
}) {
  const flagged = flaggedItems(schema, a);
  return (
    <Section as="h3" title={<StepTitle headingRef={headingRef}>Review</StepTitle>}>
      <div className="space-y-6">
        <div>
          <p className="text-body text-fg-2">
            {flagged.length === 0
              ? "Nothing is marked Fair or Poor."
              : `${flagged.length} ${flagged.length === 1 ? "item needs" : "items need"} attention.`}
          </p>
          {flagged.length > 0 && (
            <ul className="mt-2 divide-y divide-line border-y border-line">
              {flagged.map((f, i) => (
                <li key={i} className="flex items-start gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-body text-fg-1">
                      {f.item} <span className="text-fg-3">· {f.place}</span>
                    </p>
                    {f.comment && <p className="mt-0.5 text-meta text-fg-3 [overflow-wrap:anywhere]">{f.comment}</p>}
                  </div>
                  <span className="shrink-0 text-meta text-fg-2">{f.rating}</span>
                  <button
                    type="button"
                    onClick={() => onEdit(f.sectionKey)}
                    className={cn(textLinkClass, "shrink-0 rounded-sm text-meta pointer-coarse:min-h-11")}
                    aria-label={`Edit ${f.item}, ${f.place}`}
                  >
                    Edit
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <FormField label="Additional comments" optional>
          {(p) => (
            <Textarea
              {...p}
              rows={3}
              maxLength={2000}
              value={a.comments}
              onChange={(e) => patch({ comments: e.target.value })}
              className="field-sizing-content max-h-60 min-h-20 placeholder:text-pub-faint"
            />
          )}
        </FormField>
        <p className="text-meta text-fg-3">
          {property ? `${shortAddress(property.address)}${a.unitLabel ? `, ${a.unitLabel}` : ""}` : "Your report"} goes to HG Capital, and a copy to {a.email.trim() || "you"}.
        </p>
      </div>
    </Section>
  );
}
