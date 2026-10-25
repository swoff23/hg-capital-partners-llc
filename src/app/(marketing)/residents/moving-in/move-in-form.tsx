"use client";
import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import type { MoveInFormSchema, MoveInSection } from "@/lib/move-in-form-types";
import { submitMoveInInspection } from "./actions";
import { todayYmd } from "@/lib/dates";
import { callAction } from "@/lib/action-result";
import { publicCtaClass, publicType } from "@/components/public/ui";
import { SegmentedControl } from "@/components/segmented-control";
import { SpotArt } from "@/components/spot-art";
import { Button, Input, Section, Select, Textarea } from "@/components/ui";
import { cn } from "@/lib/utils";

const RATINGS = ["Good", "Fair", "Poor", "N/A"] as const;
type Rating = (typeof RATINGS)[number] | "";
const RATING_OPTIONS = RATINGS.map((r) => ({ key: r, label: r }));

type ItemAnswer = { rating: Rating; comment: string };
type Instance = { location: string; items: Record<string, ItemAnswer> };
type SectionAnswers = Record<string, Instance[]>; // sectionKey -> instances

// The app's own fields (ui.tsx), which the public wrapper's tokens draw in the
// dark material, with the public site's placeholder color. Labels sit 6px
// above in text-meta 500, sentence case.
const fieldClass = "mt-1.5 placeholder:text-pub-faint";
const labelClass = "text-meta font-medium text-fg-2";
/** A required select's empty prompt reads as a placeholder; its options keep --fg-1. */
const promptSelect = "invalid:text-pub-faint [&>option]:text-fg-1";

function blankInstance(section: MoveInSection): Instance {
  return {
    location: "",
    items: Object.fromEntries(section.items.map((i) => [i.key, { rating: "", comment: "" }])),
  };
}

function initialSections(schema: MoveInFormSchema): SectionAnswers {
  const out: SectionAnswers = {};
  for (const s of schema.sections) {
    out[s.key] = Array.from({ length: Math.max(1, s.minCount) }, () => blankInstance(s));
  }
  return out;
}

export function MoveInForm({
  schema,
  properties,
}: {
  schema: MoveInFormSchema;
  properties: { id: string; address: string; units: string[] }[];
}) {
  const [tenantName, setTenantName] = useState("");
  const [inspectionDate, setInspectionDate] = useState(() => todayYmd());
  const [propertyId, setPropertyId] = useState("");
  const [unitLabel, setUnitLabel] = useState("");
  // Ask for the unit only where there's a choice; a one-unit property sends its unit.
  const units = properties.find((p) => p.id === propertyId)?.units ?? [];
  const [sections, setSections] = useState<SectionAnswers>(() => initialSections(schema));
  const [additionalComments, setAdditionalComments] = useState("");
  const [submitterName, setSubmitterName] = useState("");
  const [submitterEmail, setSubmitterEmail] = useState("");
  const [honeypot, setHoneypot] = useState("");

  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function updateItem(sectionKey: string, index: number, itemKey: string, patch: Partial<ItemAnswer>) {
    setSections((prev) => {
      const list = [...prev[sectionKey]];
      list[index] = {
        ...list[index],
        items: { ...list[index].items, [itemKey]: { ...list[index].items[itemKey], ...patch } },
      };
      return { ...prev, [sectionKey]: list };
    });
  }

  function updateLocation(sectionKey: string, index: number, location: string) {
    setSections((prev) => {
      const list = [...prev[sectionKey]];
      list[index] = { ...list[index], location };
      return { ...prev, [sectionKey]: list };
    });
  }

  function addInstance(section: MoveInSection) {
    setSections((prev) => ({
      ...prev,
      [section.key]: [...prev[section.key], blankInstance(section)],
    }));
  }

  function removeInstance(sectionKey: string, index: number) {
    setSections((prev) => ({ ...prev, [sectionKey]: prev[sectionKey].filter((_, i) => i !== index) }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const payload = {
        tenantName,
        inspectionDate,
        propertyId,
        unitLabel: units.length === 1 ? units[0] : unitLabel || undefined,
        sections: schema.sections.map((s) => ({
          sectionKey: s.key,
          instances: sections[s.key].map((inst) => ({
            location: inst.location || undefined,
            answers: Object.entries(inst.items)
              .filter(([, a]) => a.rating)
              .map(([itemKey, a]) => ({ itemKey, rating: a.rating, comment: a.comment || undefined })),
          })),
        })),
        additionalComments: additionalComments || undefined,
        submitterName,
        submitterEmail,
        honeypot: honeypot || undefined,
      };
      // A dropped connection rejects the call instead of returning an error. Left
      // uncaught it reaches the error boundary, which replaces the form and loses
      // every answer; callAction turns it into a message and the report stays.
      const result = await callAction(async () => {
        const r = await submitMoveInInspection(payload);
        return r.ok ? { ok: true as const, data: undefined } : r;
      });
      if (result.ok) setDone(true);
      else setError(result.error);
    });
  }

  // The payoff: the move-in line art, a warm heading and what happens next.
  if (done) {
    return (
      <div role="status" className="flex flex-col items-start gap-5 border-t border-line pt-8">
        <SpotArt name="move-in-sent" />
        <div>
          <p className={cn(publicType.heading, "text-fg-1")}>Thanks! Your move-in report is in.</p>
          <p className={cn(publicType.meta, "mt-2 text-fg-3")}>
            We&rsquo;ve received it and will follow up if anything needs attention.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-8 text-left">
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

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={labelClass}>Tenant name</span>
          <Input required value={tenantName} onChange={(e) => setTenantName(e.target.value)} className={fieldClass} />
        </label>
        <label className="block">
          <span className={labelClass}>Date of inspection</span>
          <Input
            required
            type="date"
            value={inspectionDate}
            onChange={(e) => setInspectionDate(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className={labelClass}>Property</span>
          <Select
            required
            value={propertyId}
            onChange={(e) => {
              setPropertyId(e.target.value);
              setUnitLabel("");
            }}
            // Required with an empty disabled first option, so it's :invalid until something is
            // picked: the prompt reads as a placeholder (--pub-faint), the picks in --fg-1.
            className={cn(fieldClass, promptSelect)}
          >
            <option value="" disabled>
              Select your property
            </option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.address}
              </option>
            ))}
          </Select>
        </label>
        {units.length > 1 && (
          <label className="block sm:col-span-2">
            <span className={labelClass}>Unit</span>
            <Select required value={unitLabel} onChange={(e) => setUnitLabel(e.target.value)} className={cn(fieldClass, promptSelect)}>
              <option value="" disabled>
                Select your unit
              </option>
              {units.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </Select>
          </label>
        )}
      </div>

      {schema.sections.map((section) => (
        <SectionBlock
          key={section.key}
          section={section}
          instances={sections[section.key]}
          onItemChange={(i, itemKey, patch) => updateItem(section.key, i, itemKey, patch)}
          onLocationChange={(i, v) => updateLocation(section.key, i, v)}
          onAdd={() => addInstance(section)}
          onRemove={(i) => removeInstance(section.key, i)}
        />
      ))}

      <label className="block">
        <span className={labelClass}>Additional comments</span>
        <Textarea
          value={additionalComments}
          onChange={(e) => setAdditionalComments(e.target.value)}
          rows={3}
          className={cn(fieldClass, "block resize-y")}
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={labelClass}>Your name</span>
          <Input
            required
            value={submitterName}
            onChange={(e) => setSubmitterName(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>Your email</span>
          <Input
            required
            type="email"
            value={submitterEmail}
            onChange={(e) => setSubmitterEmail(e.target.value)}
            className={fieldClass}
          />
        </label>
      </div>

      {error && (
        <p role="alert" className="text-meta text-danger">
          {error}
        </p>
      )}

      <button type="submit" disabled={pending} className={cn(publicCtaClass, "w-full")}>
        {pending ? "Submitting…" : "Submit move-in report"}
      </button>
    </form>
  );
}

/**
 * One room of the report: a Section (heading over a hairline, "Add another"
 * at its right end for a repeatable room), then each instance's items, each
 * with a Good / Fair / Poor / N/A segmented control and an optional comment.
 */
function SectionBlock({
  section,
  instances,
  onItemChange,
  onLocationChange,
  onAdd,
  onRemove,
}: {
  section: MoveInSection;
  instances: Instance[];
  onItemChange: (index: number, itemKey: string, patch: Partial<ItemAnswer>) => void;
  onLocationChange: (index: number, value: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  return (
    <Section
      as="h3"
      title={
        <>
          {section.label}
          {section.minCount === 0 && <span className="ml-2 text-meta font-normal text-fg-3">(optional)</span>}
        </>
      }
      actions={
        section.repeatable &&
        instances.length < section.maxCount && (
          // The room stays in the accessible name; the visible label is short, so
          // the header fits at 320 whatever the room is called in /settings.
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onAdd}
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
            {section.hasLocation && (
              <div className="mb-1 flex items-center gap-2">
                <Input
                  value={inst.location}
                  onChange={(e) => onLocationChange(i, e.target.value)}
                  // The section's heading names the room; the aria-label keeps its name and number.
                  placeholder="e.g. Upstairs"
                  aria-label={`${section.label} ${i + 1} location`}
                  className="placeholder:text-pub-faint"
                />
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
                return (
                  <div key={item.key} className="py-3">
                    {/* Below 640 every item's control sits under its label, from 640 beside it:
                        the width decides, not the label's length, so the controls line up. */}
                    <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                      <span className="text-body text-fg-1">{item.label}</span>
                      <SegmentedControl
                        aria-label={`${item.label} condition`}
                        options={RATING_OPTIONS}
                        size="md"
                        value={answer.rating || null}
                        // Picking the chosen rating again clears it.
                        onChange={(r) => onItemChange(i, item.key, { rating: answer.rating === r ? "" : r })}
                      />
                    </div>
                    {/* A quiet field: its text lines up with the item's label, and its edge shows on hover and focus. */}
                    <input
                      value={answer.comment}
                      onChange={(e) => onItemChange(i, item.key, { comment: e.target.value })}
                      placeholder="Comment (optional)"
                      aria-label={`${item.label} comment`}
                      className={cn(
                        "-mx-2 mt-2 block h-8 w-[calc(100%+1rem)] rounded-md border border-transparent bg-transparent px-1.75 text-meta text-fg-1 outline-none placeholder:text-pub-faint pointer-coarse:min-h-11",
                        "hover:border-line focus:border-act focus:bg-surface focus:ring-1 focus:ring-inset focus:ring-act",
                      )}
                    />
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
