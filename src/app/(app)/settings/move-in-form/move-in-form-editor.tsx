"use client";
import { useState, useTransition } from "react";
import { Button, PageHeader, SectionCard } from "@/components/ui";
import type { MoveInFormSchema, MoveInSection } from "@/lib/move-in-form-types";
import { saveMoveInFormSchema } from "./actions";

const quiet =
  "w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-xs outline-none hover:border-border focus:border-primary focus:bg-surface";
const addLink =
  "text-xs font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted disabled:no-underline disabled:hover:no-underline";

function TrashIcon() {
  return (
    <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
      <path
        d="M2.5 4h9M5.5 4V2.8c0-.44.36-.8.8-.8h1.4c.44 0 .8.36.8.8V4M8.7 4v7.2c0 .44-.36.8-.8.8H6.1c-.44 0-.8-.36-.8-.8V4M3.8 4l.35 7.25c.03.53.46.95.99.95h3.72c.53 0 .96-.42.99-.95L10.2 4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Same shape as capex-rules-editor.tsx's local ConfirmDialog — not shared/exported there. */
function ConfirmDialog({
  title,
  body,
  actions,
  onClose,
}: {
  title: string;
  body: React.ReactNode;
  actions: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-sm rounded-xl border border-border bg-surface p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h4 className="text-sm font-semibold">{title}</h4>
        <div className="mt-1 text-xs text-muted">{body}</div>
        <div className="mt-4 flex items-center justify-end gap-2">{actions}</div>
      </div>
    </div>
  );
}

function newItemKey(): string {
  return `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function SectionEditor({
  section,
  onChange,
}: {
  section: MoveInSection;
  onChange: (fn: (s: MoveInSection) => void) => void;
}) {
  return (
    <SectionCard
      title={section.label}
      editing
      actions={
        <button
          type="button"
          onClick={() => onChange((s) => void s.items.push({ key: newItemKey(), label: "" }))}
          className={addLink}
        >
          + Add item
        </button>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-4 border-b border-border pb-3 text-xs">
          {section.repeatable && (
            <label className="flex items-center gap-1.5">
              <span className="text-muted">Max instances</span>
              <input
                type="number"
                min={1}
                max={10}
                value={section.maxCount}
                onChange={(e) =>
                  onChange((s) => {
                    const n = Math.max(1, Math.min(10, Math.trunc(Number(e.target.value)) || 1));
                    s.maxCount = n;
                    if (s.minCount > n) s.minCount = n;
                  })
                }
                className="h-7 w-14 rounded border border-border bg-surface px-1.5 text-center outline-none focus:border-primary"
              />
            </label>
          )}
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={section.minCount >= 1}
              onChange={(e) => onChange((s) => void (s.minCount = e.target.checked ? 1 : 0))}
            />
            <span className="text-muted">{section.repeatable ? "At least one required" : "Required"}</span>
          </label>
        </div>

        <div className="space-y-1">
          {section.items.map((it, ii) => (
            <div key={it.key} className="flex items-center gap-2">
              <input
                value={it.label}
                onChange={(e) => onChange((s) => void (s.items[ii].label = e.target.value))}
                placeholder="Item name"
                className={quiet}
              />
              <button
                type="button"
                onClick={() => onChange((s) => void s.items.splice(ii, 1))}
                disabled={section.items.length <= 1}
                aria-label={`Remove ${it.label || "item"}`}
                className="shrink-0 text-muted hover:text-red-600 disabled:opacity-30"
              >
                <TrashIcon />
              </button>
            </div>
          ))}
        </div>
      </div>
    </SectionCard>
  );
}

export function MoveInFormEditor({ initial }: { initial: MoveInFormSchema }) {
  const [schema, setSchema] = useState<MoveInFormSchema>(structuredClone(initial));
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const dirty = JSON.stringify(schema) !== JSON.stringify(initial);

  function mutate(fn: (s: MoveInFormSchema) => void) {
    setSchema((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
  }

  function save() {
    setError(null);
    start(async () => {
      try {
        const saved = await saveMoveInFormSchema(schema);
        setSchema(saved);
      } catch {
        setError("Could not save — check the form and try again.");
      }
    });
  }

  function discard() {
    setSchema(structuredClone(initial));
    setConfirmOpen(false);
  }

  function cancel() {
    if (dirty) setConfirmOpen(true);
    else discard();
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Settings"
        subtitle="Move-in inspection form — rooms and items tenants are asked to rate"
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={save} disabled={pending || !dirty}>
              {pending ? "Saving…" : "Save"}
            </Button>
            <Button size="sm" variant="secondary" onClick={cancel} disabled={pending}>
              Cancel
            </Button>
          </div>
        }
      />

      {error && <p className="text-xs font-medium text-red-600 dark:text-red-400">{error}</p>}

      {schema.sections.map((section, si) => (
        <SectionEditor
          key={section.key}
          section={section}
          onChange={(fn) => mutate((s) => fn(s.sections[si]))}
        />
      ))}

      {confirmOpen && (
        <ConfirmDialog
          title="Discard changes?"
          onClose={() => setConfirmOpen(false)}
          body="This discards everything you've edited on this tab since the last save."
          actions={
            <>
              <Button size="sm" variant="secondary" onClick={() => setConfirmOpen(false)}>
                Keep editing
              </Button>
              <Button size="sm" variant="danger" onClick={discard}>
                Discard
              </Button>
            </>
          }
        />
      )}
    </div>
  );
}
