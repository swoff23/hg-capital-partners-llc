"use client";
import { useState, useTransition } from "react";
import type { MoveInFormSchema, MoveInSection } from "@/lib/move-in-form-types";
import { submitMoveInInspection } from "./actions";

const RATINGS = ["Good", "Fair", "Poor", "N/A"] as const;
type Rating = (typeof RATINGS)[number] | "";

type ItemAnswer = { rating: Rating; comment: string };
type Instance = { location: string; items: Record<string, ItemAnswer> };
type SectionAnswers = Record<string, Instance[]>; // sectionKey -> instances

const inputClass =
  "h-10 w-full rounded-lg border border-white/15 bg-white/[0.03] px-3 text-sm text-[#e8eaee] placeholder:text-[#4c525c] focus:border-[#c8a765]/60 focus:outline-none";
const labelClass = "text-xs font-medium uppercase tracking-wider text-[#767d8a]";

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
  properties: { id: string; address: string }[];
}) {
  const [tenantName, setTenantName] = useState("");
  const [inspectionDate, setInspectionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [propertyId, setPropertyId] = useState("");
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
      const result = await submitMoveInInspection(payload);
      if (result.ok) setDone(true);
      else setError(result.error);
    });
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-white/15 p-8 text-center">
        <p className="text-sm font-medium text-[#e8eaee]">Thanks — your move-in report is in.</p>
        <p className="mt-2 text-sm leading-relaxed text-[#767d8a]">
          We&rsquo;ve received it and will follow up if anything needs attention.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-8 text-left">
      {/* Honeypot — invisible and unreachable by tab order for real users. */}
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
          <input
            required
            value={tenantName}
            onChange={(e) => setTenantName(e.target.value)}
            className={`mt-1.5 ${inputClass}`}
          />
        </label>
        <label className="block">
          <span className={labelClass}>Date of inspection</span>
          <input
            required
            type="date"
            value={inspectionDate}
            onChange={(e) => setInspectionDate(e.target.value)}
            className={`mt-1.5 ${inputClass}`}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className={labelClass}>Property</span>
          <select
            required
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
            className={`mt-1.5 ${inputClass}`}
          >
            <option value="" disabled className="bg-[#0d0f13]">
              Select your property
            </option>
            {properties.map((p) => (
              <option key={p.id} value={p.id} className="bg-[#0d0f13]">
                {p.address}
              </option>
            ))}
          </select>
        </label>
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
        <textarea
          value={additionalComments}
          onChange={(e) => setAdditionalComments(e.target.value)}
          rows={3}
          className={`mt-1.5 resize-y rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2 text-sm text-[#e8eaee] placeholder:text-[#4c525c] focus:border-[#c8a765]/60 focus:outline-none`}
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={labelClass}>Your name</span>
          <input
            required
            value={submitterName}
            onChange={(e) => setSubmitterName(e.target.value)}
            className={`mt-1.5 ${inputClass}`}
          />
        </label>
        <label className="block">
          <span className={labelClass}>Your email</span>
          <input
            required
            type="email"
            value={submitterEmail}
            onChange={(e) => setSubmitterEmail(e.target.value)}
            className={`mt-1.5 ${inputClass}`}
          />
        </label>
      </div>

      {error && (
        <p className="rounded-lg border border-[#e0796a]/25 bg-[#e0796a]/[0.08] px-3 py-2 text-xs text-[#e5a99b]">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full bg-[#e8eaee] px-7 py-3 text-[0.8125rem] font-medium tracking-wide text-[#08090b] transition-colors duration-200 hover:bg-[#c8a765] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Submitting…" : "Submit move-in report"}
      </button>
    </form>
  );
}

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
    <div>
      <div className="flex items-center justify-between gap-2 border-b border-white/15 pb-2">
        <h3 className="text-sm font-medium text-[#e8eaee]">
          {section.label}
          {section.minCount === 0 && <span className="ml-2 text-xs text-[#5b6576]">(optional)</span>}
        </h3>
        {section.repeatable && instances.length < section.maxCount && (
          <button type="button" onClick={onAdd} className="text-xs font-medium text-[#c8a765] hover:underline">
            + Add another {section.label.toLowerCase()}
          </button>
        )}
      </div>

      <div className="mt-4 space-y-6">
        {instances.map((inst, i) => (
          <div key={i} className="rounded-2xl border border-white/10 p-4">
            {section.hasLocation && (
              <div className="mb-3 flex items-center gap-2">
                <input
                  value={inst.location}
                  onChange={(e) => onLocationChange(i, e.target.value)}
                  placeholder={`${section.label} ${i + 1} — e.g. "Upstairs"`}
                  className={`${inputClass} h-9`}
                />
                {i > 0 && (
                  <button
                    type="button"
                    onClick={() => onRemove(i)}
                    className="shrink-0 text-xs text-[#767d8a] hover:text-red-400"
                  >
                    Remove
                  </button>
                )}
              </div>
            )}
            <div className="divide-y divide-white/[0.06]">
              {section.items.map((item) => {
                const answer = inst.items[item.key] ?? { rating: "", comment: "" };
                return (
                  <div key={item.key} className="py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm text-[#e8eaee]">{item.label}</span>
                      <div className="flex gap-1">
                        {RATINGS.map((r) => (
                          <button
                            key={r}
                            type="button"
                            onClick={() => onItemChange(i, item.key, { rating: answer.rating === r ? "" : r })}
                            className={
                              "rounded-full border px-2.5 py-1 text-[0.6875rem] font-medium transition-colors " +
                              (answer.rating === r
                                ? "border-[#c8a765] bg-[#c8a765]/10 text-[#c8a765]"
                                : "border-white/15 text-[#767d8a] hover:border-white/30")
                            }
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                    </div>
                    <input
                      value={answer.comment}
                      onChange={(e) => onItemChange(i, item.key, { comment: e.target.value })}
                      placeholder="Comment (optional)"
                      className="mt-2 h-8 w-full rounded-md border border-transparent bg-transparent px-2 text-xs text-[#e8eaee] placeholder:text-[#4c525c] hover:border-white/10 focus:border-[#c8a765]/40 focus:bg-white/[0.03] focus:outline-none"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
