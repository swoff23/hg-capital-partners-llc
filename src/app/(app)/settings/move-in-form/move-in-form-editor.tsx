"use client";
import { useState, useTransition } from "react";
import { Button, Input, PageHeader, Section } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { MoveInFormSchema, MoveInSection } from "@/lib/move-in-form-types";
import { saveMoveInFormSchema } from "./actions";
import { AddButton, RemoveButton, quietField } from "../editor-controls";

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
    <Section
      title={section.label}
      className="@container"
      actions={<AddButton onClick={() => onChange((s) => void s.items.push({ key: newItemKey(), label: "" }))}>Add item</AddButton>}
    >
      <div className="space-y-3">
        {/* One row where both fit; on a phone each control takes its own line, so neither row wraps. */}
        <div className="flex flex-col items-start gap-2 border-b border-line pb-3 @md:flex-row @md:items-center @md:gap-4">
          {section.repeatable && (
            <label className="flex items-center gap-2">
              <span className="text-meta font-medium text-fg-2">Max instances</span>
              <Input
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
                className="h-8 w-16 px-1.5 text-center tabular-nums"
              />
            </label>
          )}
          <label className="flex items-center gap-2 pointer-coarse:min-h-11">
            <input
              type="checkbox"
              className="size-4"
              checked={section.minCount >= 1}
              onChange={(e) => onChange((s) => void (s.minCount = e.target.checked ? 1 : 0))}
            />
            <span className="text-meta font-medium text-fg-2">{section.repeatable ? "At least one required" : "Required"}</span>
          </label>
        </div>

        <div className="divide-y divide-line">
          {section.items.map((it, ii) => (
            <div key={it.key} className="flex items-center gap-2 py-1 pointer-coarse:py-0.5">
              <input
                value={it.label}
                onChange={(e) => onChange((s) => void (s.items[ii].label = e.target.value))}
                placeholder="Item name"
                aria-label="Item name"
                className={quietField}
              />
              <RemoveButton
                onClick={() => onChange((s) => void s.items.splice(ii, 1))}
                disabled={section.items.length <= 1}
                aria-label={`Remove ${it.label || "item"}`}
              />
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

export function MoveInFormEditor({
  initial,
  initialVersion,
}: {
  initial: MoveInFormSchema;
  /** AppConfig.updatedAt the page rendered with; sent back so a stale tab cannot overwrite a newer save. */
  initialVersion: string | null;
}) {
  const [schema, setSchema] = useState<MoveInFormSchema>(() => structuredClone(initial));
  const [version, setVersion] = useState<string | null>(initialVersion);
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
      const r = await saveMoveInFormSchema(schema, version);
      if (r.ok) {
        setSchema(r.data.schema);
        setVersion(r.data.version);
      } else setError(r.error);
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
    <div className="space-y-8 pointer-coarse:space-y-6">
      <PageHeader
        title="Settings"
        subtitle="Rooms and items tenants rate on the move-in inspection"
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

      {error && <p className="text-meta text-danger">{error}</p>}

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
          cancelLabel="Keep editing"
          actions={
            <Button size="sm" variant="destructive" onClick={discard}>
              Discard changes
            </Button>
          }
        />
      )}
    </div>
  );
}
