"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ActionBar, SubmitKeycap, actionBarButton } from "@/components/action-bar";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useHoldLeave } from "@/components/leave-guard";
import { NumberInput } from "@/components/number-input";
import { Switch } from "@/components/switch";
import { useToast } from "@/components/toast";
import { useDraft, useRestoredDraft } from "@/components/use-draft";
import { useRun } from "@/components/use-run";
import { Button, Input, SaveError, Section, textLinkClass } from "@/components/ui";
import { changesLine, changesShort } from "@/lib/capex-draft";
import { moveInChangeCount, moveInProblems, type MoveInFormSchema, type MoveInSection } from "@/lib/move-in-form-types";
import { cn } from "@/lib/utils";
import { saveMoveInFormSchema } from "./actions";
import { AddButton, RevealRemoveButton, revealRow } from "../editor-controls";

function newItemKey(): string {
  return `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * A room's most instances, typed as text and kept between 1 and 10 on leaving
 * the field, so clearing it to type a new number doesn't snap back to 1.
 */
function MaxInstances({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [text, setText] = useState(String(value));
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setText(String(value));
  }
  return (
    <label className="flex items-center gap-2">
      <span className="text-meta font-medium text-fg-2">Max instances</span>
      <NumberInput
        kind="integer"
        size="sm"
        aria-label="Max instances"
        value={text}
        onChange={setText}
        onBlur={() => {
          const n = Math.max(1, Math.min(10, Math.trunc(Number(text.replace(/,/g, ""))) || 1));
          setText(String(n));
          if (n !== value) onChange(n);
        }}
        className="w-20"
      />
    </label>
  );
}

/**
 * One room: its Required switch, then its items, each a bordered field whose
 * delete shows on hover or focus (tap to reveal on touch, as the CapEx rules
 * do). Add item puts a row at the end and moves focus into it, which scrolls
 * it into view, so a tap at the top of a long room shows where the row went.
 */
function SectionEditor({
  section,
  index,
  problems,
  onChange,
}: {
  section: MoveInSection;
  index: number;
  problems: Record<string, string>;
  onChange: (fn: (s: MoveInSection) => void) => void;
}) {
  const [added, setAdded] = useState<string | null>(null);
  function addItem() {
    const key = newItemKey();
    onChange((s) => void s.items.push({ key, label: "" }));
    setAdded(key);
  }
  return (
    <Section title={section.label} className="@container" actions={<AddButton onClick={addItem}>Add item</AddButton>}>
      <div className="space-y-3">
        {/* One row where both fit; on a phone each control takes its own line, so neither row wraps. */}
        <div className="flex flex-col items-start gap-2 border-b border-line pb-3 @md:flex-row @md:items-center @md:gap-6">
          {section.repeatable && (
            <MaxInstances
              value={section.maxCount}
              onChange={(n) =>
                onChange((s) => {
                  s.maxCount = n;
                  if (s.minCount > n) s.minCount = n;
                })
              }
            />
          )}
          <Switch
            label={section.repeatable ? "At least one required" : "Required"}
            isSelected={section.minCount >= 1}
            onChange={(on) => onChange((s) => void (s.minCount = on ? 1 : 0))}
            className="w-auto @md:w-64"
          />
        </div>

        <div className="divide-y divide-line">
          {section.items.map((it, ii) => {
            const line = problems[`sections.${index}.items.${ii}.label`];
            return (
              <div key={it.key} data-reveal-row data-invalid={line ? "true" : undefined} className={cn(revealRow, "py-1.5 pointer-coarse:py-1")}>
                <div className="flex items-center gap-2">
                  <Input
                    size="sm"
                    value={it.label}
                    onChange={(e) => onChange((s) => void (s.items[ii].label = e.target.value))}
                    placeholder="Item name"
                    aria-label="Item name"
                    aria-invalid={line ? true : undefined}
                    // The row Add item just made: focused, so it scrolls into view with the caret in it.
                    autoFocus={it.key === added}
                    className="min-w-0 flex-1"
                  />
                  <RevealRemoveButton
                    onRemove={() => onChange((s) => void s.items.splice(ii, 1))}
                    disabled={section.items.length <= 1}
                    aria-label={`Remove ${it.label || "item"}`}
                  />
                </div>
                {line && <p className="mt-1 truncate text-meta text-danger">{line}</p>}
              </div>
            );
          })}
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
  /** The version of the move-in form the page rendered with; sent back so a stale tab can't overwrite a newer save. */
  initialVersion: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { run, pending, error, fieldErrors, conflict, reset: forgetRefusal } = useRun();

  const [saved, setSaved] = useState<MoveInFormSchema>(() => structuredClone(initial));
  const [schema, setSchema] = useState<MoveInFormSchema>(() => structuredClone(initial));
  const [version, setVersion] = useState<string | null>(initialVersion);
  const [tried, setTried] = useState(false);
  const [asking, setAsking] = useState(false);
  const [focusTick, setFocusTick] = useState(0);
  const body = useRef<HTMLDivElement>(null);

  const changes = moveInChangeCount(saved, schema);
  const dirty = changes > 0;
  useHoldLeave(dirty ? { title: `Leave with ${changesLine(changes)}?`, stay: "Keep editing" } : null);

  // Kept in this browser against the version it opened with, and put back after a reload or a back swipe.
  const { restored, clear: clearDraft } = useDraft(`move-in-form:${initialVersion ?? "new"}`, schema);
  useRestoredDraft(restored, {
    accept: (d) => Array.isArray(d.sections),
    apply: setSchema,
    discard: () => {
      clearDraft();
      setSchema(structuredClone(saved));
    },
  });

  function mutate(fn: (s: MoveInFormSchema) => void) {
    forgetRefusal();
    setSchema((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
  }

  const problems: Record<string, string> = { ...(tried ? moveInProblems(schema) : {}), ...(fieldErrors ?? {}) };
  const loose = Object.entries(problems).filter(([k]) => !/^sections\.\d+\.items\.\d+\.label$/.test(k));
  const barError = loose.length > 0 ? loose.map(([, line]) => line).join(" ") : fieldErrors === undefined ? error : undefined;

  useEffect(() => {
    if (focusTick === 0) return;
    const first = body.current?.querySelector<HTMLElement>('[data-invalid="true"] input');
    first?.focus({ preventScroll: true });
    first?.scrollIntoView({ block: "center" });
  }, [focusTick]);

  function save() {
    if (pending || !dirty) return;
    setTried(true);
    if (Object.keys(moveInProblems(schema)).length > 0) {
      setFocusTick((n) => n + 1);
      return;
    }
    run(() => saveMoveInFormSchema(schema, version), {
      failure: "inline",
      succeeded: (done) => {
        clearDraft();
        setSaved(structuredClone(done.schema));
        setSchema(structuredClone(done.schema));
        setVersion(done.version);
        setTried(false);
        toast({ message: "Move-in form saved", detail: "Residents see it now" });
      },
    });
  }

  return (
    <div ref={body} className="space-y-8 pointer-coarse:space-y-6">
      {schema.sections.map((section, si) => (
        <SectionEditor
          key={section.key}
          section={section}
          index={si}
          problems={problems}
          onChange={(fn) => mutate((s) => fn(s.sections[si]))}
        />
      ))}

      {asking && (
        <ConfirmDialog
          title={`Discard ${changes} ${changes === 1 ? "change" : "changes"} to the move-in form?`}
          onClose={() => setAsking(false)}
          cancelLabel="Keep editing"
          actions={
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                setAsking(false);
                clearDraft();
                setTried(false);
                forgetRefusal();
                setSchema(structuredClone(saved));
              }}
            >
              Discard changes
            </Button>
          }
        />
      )}

      {/* Only while there's something to save, docked at the bottom at every width. */}
      {dirty && (
        <ActionBar
          placement="app"
          contentClassName="box-content max-w-300"
          status={
            <>
              <span className="max-sm:hidden">{changesLine(changes)}</span>
              <span className="sm:hidden">{changesShort(changes)}</span>
            </>
          }
          error={
            barError && (
              <SaveError className="truncate">
                {barError}
                {conflict && (
                  <>
                    {" "}
                    <button type="button" className={cn(textLinkClass, "rounded-sm")} onClick={() => router.refresh()}>
                      Load the latest
                    </button>
                  </>
                )}
              </SaveError>
            )
          }
          onPrimary={save}
          secondary={
            <Button type="button" variant="secondary" className={actionBarButton} onClick={() => setAsking(true)} disabled={pending}>
              Discard
            </Button>
          }
          primary={
            <Button type="button" className={actionBarButton} pending={pending} onClick={save} aria-keyshortcuts="Meta+Enter Control+Enter">
              Save
              <SubmitKeycap />
            </Button>
          }
        />
      )}
    </div>
  );
}
