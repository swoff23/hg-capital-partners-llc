"use client";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useOptimistic,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { Button as AriaButton } from "react-aria-components";
import { AddressCombobox } from "@/components/address-combobox";
import { Code } from "@/components/code";
import { DatePanel } from "@/components/due-date-picker";
import { FormSheet } from "@/components/form-sheet";
import { useHoldLeave } from "@/components/leave-guard";
import { Money } from "@/components/money";
import { NumberInput, numberHelper } from "@/components/number-input";
import { OptionList, type OptionItem } from "@/components/option-list";
import { PickerLayer } from "@/components/picker-layer";
import { railLineClass, railVerbClass } from "@/components/rail";
import { Switch } from "@/components/switch";
import { Button, FormField, Input, Kbd, fieldClass } from "@/components/ui";
import { isCoarseNow } from "@/components/use-coarse-pointer";
import { shortcutLabel, useModKey } from "@/components/use-platform";
import { useRun } from "@/components/use-run";
import type { AddressKind } from "@/lib/address-suggestions";
import { conflictKeepLabel, conflictValueLine, type ActionResult } from "@/lib/action-result";
import { fmtDay, todayYmdEastern } from "@/lib/dates";
import {
  decideInlineEdit,
  headingSave,
  inlineSavedMessage,
  inlineShown,
  numberKindOf,
  storedText,
  type InlineDecision,
  type InlineKind,
} from "@/lib/inline-edit";
import { parseAmount } from "@/lib/money";
import { cn } from "@/lib/utils";

export type { InlineKind };

/**
 * The one way to change a single saved value (docs/specs/forms-editing.md
 * 2.8, 3.1 A): a fact in a record's rail, a note, or the page's own heading.
 * It reads as text. With a mouse a click opens the bordered field in place
 * (`sm`, the row keeps its height); on touch it opens a one-field sheet with
 * the fact's label as its title and Save pinned above the keyboard. A date or
 * a choice opens its panel in a popover (a sheet on a phone) and saves on
 * pick.
 *
 *   <InlineField kind="percent" label="Rate" field="loanRate" value="6.875" empty="Add rate"
 *     context="Loan · 767 Prospect Ave" onSave={(next, expected) => patchProperty(id, { loanRate: next }, { loanRate: expected })} />
 *
 * Commit: Enter, Tab (saves and moves to the next value; Enter opens it),
 * blur with a mouse, a pick, or Save in the sheet. A note (`multiline`)
 * commits only on Save or ⌘↵, never on blur, so a stray click can't rewrite a
 * tenant's text; a changed one holds the LeaveGuard. Esc puts the old value
 * back, closes the field and returns focus to the value. Only a real edit
 * saves, sent with the value it loaded (`expected`), so a partner's newer
 * change refuses it.
 *
 * Saving: the new value shows at once and nothing dims; a toast names the
 * change with Undo ("Rate set to 6.875%"), which writes the old value back
 * with the new one as `expected`. Refused or offline: the field reopens with
 * what was typed and the reason under it. A conflict names who and when, with
 * "Keep Pieter's" and "Save mine".
 */
export type InlineFieldProps = {
  kind: InlineKind;
  /** The fact's name: the sheet's title and the field's accessible name. "Rate". */
  label: string;
  /** The stored value as text: a date as yyyy-mm-dd, a yes or no as "yes" or "no", "" when empty. */
  value: string;
  /**
   * Writes it. `expected` is the value this field loaded (what the server
   * compares); a refusal comes back as a failed result, never a throw.
   */
  onSave: (next: string, expected: string) => Promise<ActionResult<unknown>>;
  /** The server's name for the field ("loanRate"), to read the other person's value from a conflict. */
  field?: string;
  /** The sheet's line under the title: "Loan · 767 Prospect Ave". */
  context?: string;
  /** The verb for an empty fact: "Add lender". */
  empty?: string;
  /** warn for a missing key fact (a loan maturity). */
  tone?: "warn";
  /** One line under the open field: who sees it or what happens ("Adds a reminder 60 days before"). */
  helper?: ReactNode;
  /** How the value reads at rest, in place of the kind's own. */
  display?: (text: string) => ReactNode;
  /** A unit for `integer` and `decimal`, inside the field's right edge: "sq ft". */
  unit?: string;
  /** `choice`: the options, with their stored text as `id`. */
  options?: OptionItem[];
  /** `choice`: the named empty value ("No reason"), listed first. */
  emptyLabel?: string;
  /** The least length for text and headings; 0, the default, lets a fact be emptied. */
  minLength?: number;
  /** The line for a blank heading: "Enter the address." */
  blank?: string;
  /** The line for a draft shorter than `minLength`, in the field's own words: "Enter the full street address, like 123 Main St." */
  tooShort?: string;
  /** A deal price: text that isn't one number ("low 400s") is kept. */
  allowText?: boolean;
  /** One more rule on the text, run after the kind's own once something changed: the line when it can't be saved ("Enter 1 or more."). */
  check?: (text: string) => string | null;
  /** `date`: false when the date can't be cleared. */
  allowNone?: boolean;
  /** The toast's second clause, "Reminder task added". A function can say it only for some values. */
  ripple?: string | ((next: string) => string | undefined);
  /** The toast's line, when "Rate set to 6.875%" isn't how it reads ("Item renamed"). */
  message?: (next: string) => string;
  /** Shows the value as a code that copies on one tap (a loan, policy or lockbox number); opened with `onRequest`. */
  code?: string;
  /** `heading`: the address field with suggestions and the duplicate line, for a property's or a deal's address. */
  address?: { kind: AddressKind; excludeId: string };
  /** After the value, outside its button: the open-listing link, a call link. */
  trailing?: ReactNode;
  /** Subscribes to requests to open the field from elsewhere (the fact strip's "Add value"); returns what unsubscribes. */
  onRequest?: (open: () => void) => void | (() => void);
  /** False when the line under the open field is a plain block (a heading, a note) and not a rail row's full-width line. */
  inRail?: boolean;
  /** Let a long value wrap at rest instead of ending in an ellipsis (a checklist item, whose words carry the job). */
  wrap?: boolean;
  /** Extra classes: on the heading, or on the value button. */
  className?: string;
};

/* ---------------- Shared: the save ---------------- */

/** What saves a fact: the optimistic value, the toast with Undo, and the refusal to show. */
function useFactSave(p: Pick<InlineFieldProps, "kind" | "label" | "value" | "onSave" | "unit" | "options" | "ripple" | "message" | "allowText">) {
  const run = useRun();
  const key = useId();
  const [shown, setShown] = useOptimistic(p.value);
  const labelOf = (text: string) => p.options?.find((o) => o.id === text)?.label;

  function start(next: string, expected: string, after: { failed?: () => void; succeeded?: () => void } = {}) {
    const detail = typeof p.ripple === "function" ? p.ripple(next) : p.ripple;
    run.run(() => p.onSave(next, expected), {
      before: () => setShown(next),
      failed: after.failed,
      succeeded: after.succeeded,
      done: p.message?.(next) ?? inlineSavedMessage(p.label, p.kind, next, { unit: p.unit, label: labelOf }),
      ...(detail ? { detail } : {}),
      key: `fact:${key}`,
      // Back to what it was, expecting what it is now: the stored form of what was typed ("290k" is stored as 290000).
      undo: () => p.onSave(expected, storedText(p.kind, next, { allowText: p.allowText })),
      failure: "inline",
    });
  }

  return { shown, start, labelOf, pending: run.pending, error: run.error, conflict: run.conflict, reset: run.reset };
}

type FactSave = ReturnType<typeof useFactSave>;

/** The line under an open fact: a refusal, a conflict, or the helper, one at a time, never wrapping. */
function FactLine({
  id,
  problem,
  save,
  p,
  helper,
  inRail,
}: {
  id: string;
  problem: string | null;
  save: FactSave;
  p: Pick<InlineFieldProps, "kind" | "field" | "unit">;
  helper?: ReactNode;
  inRail: boolean;
}) {
  const base = cn("mt-1 truncate text-meta", inRail && railLineClass);
  const text = problem ?? (save.conflict ? null : save.error);
  if (text) {
    return (
      <p id={id} role="alert" className={cn(base, "text-danger")}>
        {text}
      </p>
    );
  }
  if (save.conflict) {
    return (
      <p id={id} className={cn(base, "text-fg-2")}>
        {conflictLine(save, p)}
      </p>
    );
  }
  return helper ? (
    <p id={id} className={cn(base, "text-fg-3")}>
      {helper}
    </p>
  ) : null;
}

/** The other person's value, as the field would show it: undefined when the conflict carries none (a whole-blob editor). */
function theirsOf(save: FactSave, p: Pick<InlineFieldProps, "kind" | "field" | "unit">): string | undefined {
  const raw = save.conflict && p.field ? save.conflict.theirs?.[p.field] : undefined;
  return raw === undefined ? undefined : inlineShown(p.kind, raw, { unit: p.unit, label: save.labelOf });
}

function conflictLine(save: FactSave, p: Pick<InlineFieldProps, "kind" | "field" | "unit">): string {
  const c = save.conflict!;
  const theirs = theirsOf(save, p);
  return theirs === undefined ? (save.error ?? "This changed since you opened it.") : conflictValueLine(c, theirs);
}

/** Keep theirs, or save mine over it (forms 2.8): the two buttons under a conflict line. */
function ConflictButtons({
  save,
  onKeep,
  onSaveMine,
  inRail,
  stacked = false,
}: {
  save: FactSave;
  onKeep: () => void;
  onSaveMine: () => void;
  inRail: boolean;
  stacked?: boolean;
}) {
  const c = save.conflict;
  if (!c) return null;
  return (
    <div className={cn("mt-1.5 flex gap-2", stacked && "flex-col-reverse", inRail && railLineClass)}>
      <Button size="sm" variant="secondary" onClick={onKeep} className={cn(stacked && "w-full")}>
        {conflictKeepLabel(c)}
      </Button>
      <Button size="sm" onClick={onSaveMine} className={cn(stacked && "w-full")}>
        Save mine
      </Button>
    </div>
  );
}

/** The sheet's copy of the conflict: the line, and "Keep ..." under it. Save mine is the sheet's primary. */
function SheetConflict({ save, p, onKeep }: { save: FactSave; p: Pick<InlineFieldProps, "kind" | "field" | "unit">; onKeep: () => void }) {
  const c = save.conflict;
  if (!c) return null;
  return (
    <div className="space-y-2">
      <p className="text-meta text-fg-2">{conflictLine(save, p)}</p>
      <Button variant="secondary" className="w-full" onClick={onKeep}>
        {conflictKeepLabel(c)}
      </Button>
    </div>
  );
}

/* ---------------- Shared: how a value reads ---------------- */

function restDisplay(kind: InlineKind, text: string, o: { unit?: string; choiceLabel?: string }): ReactNode {
  const t = text.trim();
  const n = numberKindOf(kind) ? parseAmount(t) : null;
  switch (kind) {
    case "money":
      return n === null ? t : <Money value={n} />;
    case "percent":
      return n === null ? t : <span className="num">{n}%</span>;
    case "integer":
      return n === null ? t : <span className="num">{n.toLocaleString("en-US")}</span>;
    case "year":
    case "decimal":
      return n === null ? t : <span className="num">{String(n)}</span>;
    case "date":
      return <span className="num">{fmtDay(t)}</span>;
    case "choice":
      return o.choiceLabel ?? t;
    default:
      return t;
  }
}

/** The value as a button that reads as text: a fill and a text cursor on hover with a mouse, no pencil. */
const valueButtonClass =
  "flex min-h-8 min-w-0 flex-1 items-center gap-x-2 rounded-md -mx-2 px-2 text-left text-body text-fg-1 transition-colors pointer-fine:cursor-text pointer-fine:hover:bg-fill-1 pointer-coarse:min-h-11 aria-busy:cursor-progress";

const INPUT_MODE = { email: "email", phone: "tel", url: "url" } as const;

/** A Textarea that grows with its text: `field-sizing: content` where the browser has it, and a measuring effect where not. */
export function AutosizeTextarea({ className, ref, onChange, ...props }: ComponentProps<"textarea"> & { ref?: Ref<HTMLTextAreaElement> }) {
  const inner = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el || (typeof CSS !== "undefined" && CSS.supports("field-sizing", "content"))) return;
    const fit = () => {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    };
    fit();
    // Only a width change rewraps the text; the height this sets fires the observer too.
    let width = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      fit();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [props.value]);
  return (
    <textarea
      {...props}
      onChange={onChange}
      ref={(el) => {
        inner.current = el;
        if (typeof ref === "function") ref(el);
        else if (ref) ref.current = el;
      }}
      className={cn(fieldClass, "block resize-none overflow-hidden py-2 [field-sizing:content]", className)}
    />
  );
}

/** The next value button after `from` in the page, for Tab out of an open field. */
function nextValue(from: Element | null): HTMLElement | null {
  if (!from) return null;
  const all = [...document.querySelectorAll<HTMLElement>("[data-inline-value]")];
  return all.find((el) => !from.contains(el) && from.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) ?? null;
}

/* ---------------- The component ---------------- */

export function InlineField(props: InlineFieldProps) {
  switch (props.kind) {
    case "heading":
      return <HeadingFact {...props} />;
    case "date":
    case "choice":
      return <PickedFact {...props} />;
    default:
      return <TextFact {...props} />;
  }
}

type Mode = "rest" | "inline" | "sheet";

/** Text, a note, a number, an email, a phone or a link. */
function TextFact(props: InlineFieldProps) {
  const { kind, label, value, field, context, empty, tone, helper, display, unit, minLength, tooShort, allowText, check, code, trailing, onRequest, wrap, className } = props;
  const multiline = kind === "multiline";
  const nk = numberKindOf(kind);
  const inRail = props.inRail ?? !multiline;
  const save = useFactSave(props);
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("rest");
  const [sheetUsed, setSheetUsed] = useState(false);
  const [draft, setDraft] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const valueRef = useRef<HTMLButtonElement>(null);
  const control = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  // A close that already decided: the blur that follows it, or the unmount, must not decide again.
  const closing = useRef(false);
  const refocus = useRef(false);
  const lineId = useId();
  const mod = useModKey();
  const shown = save.shown;

  function open() {
    if (save.pending) return;
    save.reset();
    setProblem(null);
    setDraft(value);
    closing.current = false;
    if (isCoarseNow()) {
      setSheetUsed(true);
      setMode("sheet");
    } else setMode("inline");
  }

  useEffect(() => onRequest?.(open));

  // Opened in place: focus it, numbers selected so typing replaces them, text with the caret at the end.
  useLayoutEffect(() => {
    if (mode !== "inline") return;
    const el = control.current;
    if (!el) return;
    el.focus();
    if (nk) el.select();
    else el.setSelectionRange(el.value.length, el.value.length);
  }, [mode, nk]);

  // Back at rest after Esc, a save or Cancel: focus returns to the value, so a keyboard keeps its place.
  useEffect(() => {
    if (mode !== "rest" || !refocus.current) return;
    refocus.current = false;
    valueRef.current?.focus();
  }, [mode]);

  const dirty = mode === "inline" && multiline && decideInlineEdit(kind, draft, value, {}).kind !== "same";
  useHoldLeave(dirty ? { title: `Leave without saving ${label.toLowerCase()}?`, stay: "Keep editing" } : null);

  function leave(returnFocus: boolean) {
    closing.current = true;
    refocus.current = returnFocus;
    setProblem(null);
    setMode("rest");
  }

  /** Esc or Cancel: the old value comes back and the field closes. */
  function cancel() {
    save.reset();
    leave(true);
  }

  /** Leaves the field, saving a real edit. Returns whether it left (a draft that can't be read stays open). */
  function commit(force?: { expected: string }, opts: { toNext?: boolean } = {}): boolean {
    const d: InlineDecision = decideInlineEdit(kind, draft, value, { minLength, tooShort, allowText });
    if (d.kind === "problem") {
      setProblem(d.message);
      return false;
    }
    // The field's own rule, once there's something to save ("Enter 1 or more.").
    const extra = d.kind === "save" ? check?.(d.value) : null;
    if (extra) {
      setProblem(extra);
      return false;
    }
    if (d.kind === "same" && !force) {
      save.reset();
      leave(!opts.toNext);
      return true;
    }
    const sheet = mode === "sheet";
    if (!sheet) leave(!opts.toNext);
    setProblem(null);
    save.start(d.value, force?.expected ?? value, {
      // Refused or offline: the field reopens with what was typed, the reason under it.
      failed: () => {
        setDraft(d.value);
        closing.current = false;
        setMode(isCoarseNow() ? "sheet" : "inline");
        if (isCoarseNow()) setSheetUsed(true);
      },
      succeeded: () => {
        if (sheet) {
          refocus.current = true;
          setMode("rest");
        }
      },
    });
    return true;
  }

  function theirsText(): string {
    return (save.conflict && field ? save.conflict.theirs?.[field] : undefined) ?? "";
  }

  function keep() {
    save.reset();
    leave(true);
    // The page learns the other person's value.
    router.refresh();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    } else if (e.key === "Enter" && (!multiline || e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      commit(save.conflict ? { expected: theirsText() } : undefined);
    } else if (e.key === "Tab" && !e.shiftKey && !multiline) {
      const next = nextValue(root.current);
      const left = commit(save.conflict ? { expected: theirsText() } : undefined, { toNext: true });
      if (!left) e.preventDefault();
      else if (next) {
        e.preventDefault();
        requestAnimationFrame(() => next.focus());
      }
    }
  }

  function onBlur() {
    if (closing.current) {
      closing.current = false;
      return;
    }
    // A note commits on Save, never on a stray click away; a conflict waits for one of its two buttons.
    if (multiline || save.conflict) return;
    commit();
  }

  function changed(next: string) {
    setDraft(next);
    // Once a line shows, the field re-checks as you type and clears it the moment it reads.
    if (problem) {
      const d = decideInlineEdit(kind, next, value, { minLength, tooShort, allowText });
      if (d.kind !== "problem" && !(d.kind === "save" && check?.(d.value))) setProblem(null);
    }
  }

  // How it will save, only once it's been typed over: opening a stored "275000" says nothing.
  const numberLine = nk && draft !== value ? numberHelper(nk, draft, { allowText }) : undefined;
  const line = numberLine ?? helper;

  const fieldProps = {
    "aria-label": label,
    "aria-invalid": problem ? (true as const) : undefined,
    "aria-describedby": problem || save.error || save.conflict || line ? lineId : undefined,
    value: draft,
    autoComplete: "off",
    autoCapitalize: kind === "email" || kind === "url" ? "none" : undefined,
    spellCheck: kind === "email" || kind === "url" || kind === "phone" ? false : undefined,
    onKeyDown,
    onBlur,
  } as const;

  let controlNode: ReactNode;
  if (multiline) {
    controlNode = (
      <AutosizeTextarea
        ref={control as Ref<HTMLTextAreaElement>}
        {...fieldProps}
        rows={3}
        onChange={(e) => changed(e.target.value)}
        className="min-h-20 text-body"
      />
    );
  } else if (nk) {
    controlNode = (
      <NumberInput
        ref={control as Ref<HTMLInputElement>}
        kind={nk}
        size="sm"
        suffix={unit}
        allowText={allowText}
        {...fieldProps}
        enterKeyHint="done"
        onChange={changed}
      />
    );
  } else {
    controlNode = (
      <Input
        ref={control as Ref<HTMLInputElement>}
        size="sm"
        {...fieldProps}
        inputMode={kind === "email" || kind === "phone" || kind === "url" ? INPUT_MODE[kind] : undefined}
        enterKeyHint="done"
        onChange={(e) => changed(e.target.value)}
      />
    );
  }

  const saveMine = () => commit({ expected: theirsText() });
  const lineBlock = (
    <>
      <FactLine id={lineId} problem={problem} save={save} p={{ kind, field, unit }} helper={line} inRail={inRail} />
      <ConflictButtons save={save} onKeep={keep} onSaveMine={saveMine} inRail={inRail} />
    </>
  );

  // The sheet's field is at 44px on touch from Input itself, and the sheet's title stands in for the label.
  const sheetControl = (p: { id: string; "aria-describedby"?: string; "aria-invalid"?: true }) => {
    const common = { id: p.id, "aria-describedby": p["aria-describedby"], "aria-invalid": p["aria-invalid"], value: draft, autoComplete: "off" } as const;
    if (multiline) return <AutosizeTextarea {...common} rows={5} onChange={(e) => changed(e.target.value)} className="min-h-32 text-body" />;
    if (nk) return <NumberInput kind={nk} suffix={unit} allowText={allowText} {...common} enterKeyHint="done" onChange={changed} />;
    return (
      <Input
        {...common}
        inputMode={kind === "email" || kind === "phone" || kind === "url" ? INPUT_MODE[kind] : undefined}
        enterKeyHint="done"
        onChange={(e) => changed(e.target.value)}
      />
    );
  };

  const sheet = sheetUsed && (
    <FormSheet
      title={label}
      isOpen={mode === "sheet"}
      onOpenChange={(o) => {
        if (!o) cancel();
      }}
      onSubmit={() => commit(save.conflict ? { expected: theirsText() } : undefined)}
      primary={save.conflict ? "Save mine" : "Save"}
      pending={save.pending}
      values={draft}
      discard="silent"
      error={!problem && !save.conflict ? save.error : undefined}
    >
      {context && <p className="-mt-1 text-meta text-fg-3">{context}</p>}
      <FormField label={label} hideLabel helper={line} error={problem ?? undefined}>
        {sheetControl}
      </FormField>
      <SheetConflict save={save} p={{ kind, field, unit }} onKeep={keep} />
    </FormSheet>
  );

  // At rest.
  if (mode !== "inline") {
    const text = shown.trim();
    const verb = !text && empty;
    const content = display ? display(text) : restDisplay(kind, text, { unit, choiceLabel: undefined });
    return (
      <>
        <div ref={root} className={cn("flex min-w-0 flex-1 flex-col", multiline && "w-full")}>
          <div className="flex min-w-0 items-center gap-1">
            {text && code ? (
              <Code value={text} label={code} />
            ) : verb ? (
              <button
                ref={valueRef}
                type="button"
                data-inline-value=""
                onClick={open}
                aria-busy={save.pending || undefined}
                className={railVerbClass(tone)}
              >
                <Plus aria-hidden="true" strokeWidth={1.75} className="h-4 w-4 shrink-0" />
                {empty}
              </button>
            ) : (
              <button
                ref={valueRef}
                type="button"
                data-inline-value=""
                onClick={open}
                aria-busy={save.pending || undefined}
                aria-label={`${label}, ${inlineShown(kind, text, { unit }) || "empty"}, edit`}
                className={cn(valueButtonClass, multiline && "items-start py-1.5", className)}
              >
                <span className={cn("min-w-0", multiline || wrap ? "whitespace-pre-wrap text-pretty [overflow-wrap:anywhere]" : "truncate")}>
                  {content || <span className="text-fg-3">—</span>}
                </span>
              </button>
            )}
            {trailing}
          </div>
          {/* A refusal on a closed field (Undo failed, a pick that was turned down) still has its line. */}
          {(save.error || save.conflict) && mode === "rest" && (
            <>
              <FactLine id={lineId} problem={null} save={save} p={{ kind, field, unit }} inRail={inRail} />
              <ConflictButtons save={save} onKeep={keep} onSaveMine={saveMine} inRail={inRail} />
            </>
          )}
        </div>
        {sheet}
      </>
    );
  }

  // Open in place with a mouse.
  return (
    <div ref={root} className={cn("min-w-0 flex-1", multiline && "w-full")}>
      {controlNode}
      {multiline && (
        <div className="mt-2 flex justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={cancel} aria-keyshortcuts="Escape">
            Cancel
            <Kbd aria-hidden="true">Esc</Kbd>
          </Button>
          <Button size="sm" onClick={() => commit(save.conflict ? { expected: theirsText() } : undefined)} aria-keyshortcuts="Meta+Enter Control+Enter">
            Save
            <Kbd aria-hidden="true">{shortcutLabel(mod, "↵")}</Kbd>
          </Button>
        </div>
      )}
      {lineBlock}
    </div>
  );
}

/* ---------------- The heading ---------------- */

// The page's h1 on the title token, editable or not. font-semibold repeats the token's weight so a caller's size override (the task title) keeps it.
const headingText = "rounded-md px-2 py-1 pr-6 text-title font-semibold text-fg-1";

/** Whether a combobox's list is open and drawn: AddressCombobox keeps an empty list open but hidden. */
function listOnScreen(input: HTMLElement): boolean {
  if (input.getAttribute("aria-expanded") !== "true") return false;
  const id = input.getAttribute("aria-controls");
  const list = id ? document.getElementById(id) : null;
  return !!list && list.getClientRects().length > 0;
}

/**
 * The page's h1: the address of a property or a deal, a task's title, a
 * contractor's name. A click opens the field in place (a bordered address
 * field with suggestions for an address), on touch the one-field sheet. Enter
 * or leaving commits, Esc puts the saved name back. A name too short says so
 * under the field instead of snapping back, and a refused rename never stays
 * on screen: the field reopens with what was typed and the reason.
 */
function HeadingFact(props: InlineFieldProps) {
  const { label, value, field, context, minLength = 1, blank, tooShort, address, onRequest, className } = props;
  const save = useFactSave(props);
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("rest");
  const [sheetUsed, setSheetUsed] = useState(false);
  const [draft, setDraft] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const valueRef = useRef<HTMLButtonElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const closing = useRef(false);
  const refocus = useRef(false);
  const lineId = useId();
  const shown = save.shown;

  function open() {
    if (save.pending) return;
    save.reset();
    setProblem(null);
    setDraft(value);
    closing.current = false;
    if (isCoarseNow()) {
      setSheetUsed(true);
      setMode("sheet");
    } else setMode("inline");
  }
  useEffect(() => onRequest?.(open));

  useLayoutEffect(() => {
    if (mode !== "inline") return;
    const el = area.current ?? root.current?.querySelector<HTMLInputElement>("input");
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [mode]);

  useEffect(() => {
    if (mode !== "rest" || !refocus.current) return;
    refocus.current = false;
    valueRef.current?.focus();
  }, [mode]);

  function leave() {
    closing.current = true;
    refocus.current = true;
    setProblem(null);
    setMode("rest");
  }
  function cancel() {
    save.reset();
    leave();
  }

  function commit(force?: { expected: string }): boolean {
    const d = decideInlineEdit("heading", draft, value, { minLength, blank, tooShort });
    if (d.kind === "problem") {
      setProblem(d.message);
      return false;
    }
    // An address saves tidied (headingSave), and typing that tidies to the saved address is no edit.
    const next = d.kind === "save" ? headingSave(d.value, value, { address: !!address }) : null;
    if (next === null && !force) {
      save.reset();
      leave();
      return true;
    }
    const sheet = mode === "sheet";
    if (!sheet) leave();
    setProblem(null);
    // With "Save mine" an unchanged draft still saves: the saved value, or the tidied one, which is it.
    save.start(next ?? (d.kind === "save" ? value : d.value), force?.expected ?? value, {
      failed: () => {
        setDraft(d.value);
        closing.current = false;
        const coarse = isCoarseNow();
        if (coarse) setSheetUsed(true);
        setMode(coarse ? "sheet" : "inline");
      },
      succeeded: () => {
        if (sheet) {
          refocus.current = true;
          setMode("rest");
        }
      },
    });
    return true;
  }

  const theirsText = () => (save.conflict && field ? save.conflict.theirs?.[field] : undefined) ?? "";
  const saveMine = () => commit({ expected: theirsText() });
  function keep() {
    save.reset();
    leave();
    router.refresh();
  }

  function changed(next: string) {
    setDraft(next);
    if (problem && decideInlineEdit("heading", next, value, { minLength, blank, tooShort }).kind !== "problem") setProblem(null);
  }

  function onKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (e.nativeEvent.isComposing) return;
    // The address field's list is a layer of its own: Esc closes it first, and Enter on a highlighted
    // suggestion picks it (one Esc, one layer), before either reaches the field. Under 3 characters
    // the list is open but empty and out of sight (AddressCombobox), so it is no layer to close.
    const listOpen = listOnScreen(e.target as HTMLElement);
    if (e.key === "Escape") {
      if (listOpen) return;
      e.preventDefault();
      cancel();
    } else if (e.key === "Enter" && !e.shiftKey) {
      if (listOpen && (e.target as HTMLElement).getAttribute("aria-activedescendant")) return;
      e.preventDefault();
      commit(save.conflict ? { expected: theirsText() } : undefined);
    }
  }
  function onBlur() {
    if (closing.current) {
      closing.current = false;
      return;
    }
    if (save.conflict) return;
    commit();
  }

  const sheet = sheetUsed && (
    <FormSheet
      title={label}
      isOpen={mode === "sheet"}
      onOpenChange={(o) => {
        if (!o) cancel();
      }}
      onSubmit={() => commit(save.conflict ? { expected: theirsText() } : undefined)}
      primary={save.conflict ? "Save mine" : "Save"}
      pending={save.pending}
      values={draft}
      discard="silent"
      error={!problem && !save.conflict ? save.error : undefined}
    >
      {context && <p className="-mt-1 text-meta text-fg-3">{context}</p>}
      {address ? (
        <AddressCombobox
          kind={address.kind}
          excludeId={address.excludeId}
          aria-label={label}
          value={draft}
          onChange={changed}
          isInvalid={!!problem}
          errorMessage={problem ?? undefined}
          // Leaving the field inside the sheet says how it will save; in place, leaving saves.
          showSavesAs
        />
      ) : (
        <FormField label={label} hideLabel error={problem ?? undefined}>
          {(p) => <Input {...p} value={draft} autoComplete="off" enterKeyHint="done" onChange={(e) => changed(e.target.value)} />}
        </FormField>
      )}
      <SheetConflict save={save} p={{ kind: "heading", field }} onKeep={keep} />
    </FormSheet>
  );

  if (mode !== "inline") {
    // A desktop hover cue only; touch has no hover, and a tap opens the field.
    return (
      <>
        <h1 className="group/addr relative -mx-2 min-w-0">
          <button
            ref={valueRef}
            type="button"
            data-inline-value=""
            onClick={open}
            aria-busy={save.pending || undefined}
            className={cn(
              headingText,
              "text-balance text-left transition-colors [overflow-wrap:anywhere] pointer-fine:hover:bg-fill-1",
              className,
            )}
          >
            {shown}
          </button>
          <Pencil
            aria-hidden="true"
            strokeWidth={1.5}
            className="pointer-events-none absolute right-2 top-3 h-4 w-4 text-fg-3 opacity-0 transition-opacity pointer-fine:group-hover/addr:opacity-100"
          />
        </h1>
        {/* A refusal that landed after the field closed, under the heading and not inside it. */}
        {(save.error || save.conflict) && (
          <div className="-mx-2 px-2">
            <FactLine id={lineId} problem={null} save={save} p={{ kind: "heading", field }} inRail={false} />
            <ConflictButtons save={save} onKeep={keep} onSaveMine={saveMine} inRail={false} />
          </div>
        )}
        {sheet}
      </>
    );
  }

  return (
    <div ref={root} className="-mx-2 w-full min-w-0" onKeyDown={address ? onKeyDown : undefined} onBlur={address ? (e) => !e.currentTarget.contains(e.relatedTarget) && onBlur() : undefined}>
      {address ? (
        <AddressCombobox
          kind={address.kind}
          excludeId={address.excludeId}
          aria-label={label}
          value={draft}
          onChange={changed}
          isInvalid={!!problem}
          errorMessage={problem ?? undefined}
          className="px-2"
        />
      ) : (
        <AutosizeTextarea
          ref={area}
          aria-label={label}
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem || save.error || save.conflict ? lineId : undefined}
          rows={1}
          value={draft}
          onChange={(e) => changed(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
          // Editing reads as a field: --surface with the focus edge, at the heading's size.
          className={cn("w-full border-line-control px-2 py-1 text-title font-semibold", className)}
        />
      )}
      <div className="px-2">
        <FactLine id={lineId} problem={address ? null : problem} save={save} p={{ kind: "heading", field }} inRail={false} />
        <ConflictButtons save={save} onKeep={keep} onSaveMine={saveMine} inRail={false} />
      </div>
    </div>
  );
}

/* ---------------- A date or a choice: a pick saves ---------------- */

/** A date or a choice. The value opens its panel (a popover, a sheet on a phone) and a pick saves. */
function PickedFact(props: InlineFieldProps) {
  const { kind, label, value, field, empty, tone, display, unit, options = [], emptyLabel, allowNone = true, trailing, onRequest, className } = props;
  const inRail = props.inRail ?? true;
  const save = useFactSave(props);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // The pick a conflict turned down, to send again on "Save mine".
  const [turnedDown, setTurnedDown] = useState<string | null>(null);
  const lineId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const shown = save.shown;
  const text = shown.trim();
  const choiceLabel = kind === "choice" ? options.find((o) => o.id === text)?.label : undefined;

  useEffect(() => onRequest?.(() => setOpen(true)));

  function pick(next: string) {
    if (next === value) return;
    setTurnedDown(null);
    save.start(next, value, { failed: () => setTurnedDown(next) });
  }
  function theirs(): string {
    return (save.conflict && field ? save.conflict.theirs?.[field] : undefined) ?? "";
  }

  const empties = !text;
  const verb = empties && empty;
  const content = display ? display(text) : restDisplay(kind, text, { unit, choiceLabel });
  const triggerProps = {
    ref: triggerRef,
    "data-inline-value": "",
    "aria-busy": save.pending || undefined,
  };

  const trigger = verb ? (
    <AriaButton {...triggerProps} className={railVerbClass(tone)}>
      <Plus aria-hidden="true" strokeWidth={1.75} className="h-4 w-4 shrink-0" />
      {empty}
    </AriaButton>
  ) : (
    <AriaButton {...triggerProps} aria-label={`${label}, ${text ? inlineShown(kind, text, { label: (t) => options.find((o) => o.id === t)?.label }) : "empty"}, edit`} className={cn(valueButtonClass, className)}>
      <span className="min-w-0 truncate">{content || <span className="text-fg-3">{emptyLabel ?? "—"}</span>}</span>
    </AriaButton>
  );

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex min-w-0 items-center gap-1">
        <PickerLayer isOpen={open} onOpenChange={setOpen} title={label} motion={kind === "date" ? "pop" : "none"} trigger={trigger}>
          {({ container, close }) =>
            kind === "date" ? (
              <DatePanel
                value={text || null}
                today={todayYmdEastern()}
                label={label}
                picks={false}
                allowNone={allowNone}
                layout={container === "sheet" ? "steps" : "together"}
                onPick={(next) => {
                  close();
                  pick(next ?? "");
                }}
              />
            ) : (
              <OptionList
                aria-label={label}
                container={container}
                pinned={emptyLabel ? [{ id: "", label: emptyLabel, muted: true }] : undefined}
                items={options}
                selectedKey={text}
                onPick={(id) => {
                  close();
                  pick(id);
                }}
                onTab={close}
                searchLabel={`Search ${label.toLowerCase()}`}
              />
            )
          }
        </PickerLayer>
        {trailing}
      </div>
      {(save.error || save.conflict) && (
        <>
          <FactLine id={lineId} problem={null} save={save} p={{ kind, field, unit }} inRail={inRail} />
          <ConflictButtons
            save={save}
            inRail={inRail}
            onKeep={() => {
              save.reset();
              setTurnedDown(null);
              router.refresh();
            }}
            onSaveMine={() => {
              if (turnedDown !== null) save.start(turnedDown, theirs(), { failed: () => {} });
            }}
          />
        </>
      )}
    </div>
  );
}

/* ---------------- A yes or no ---------------- */

/**
 * A yes or no fact as a Switch, saved on toggle (selectors 3.10: Escrow,
 * one tap). The same save as every fact: the new state at once, a toast with
 * Undo, the reason under it if it's refused.
 */
export function InlineSwitch(props: {
  label: string;
  /** "yes" or "no". */
  value: string;
  onSave: (next: string, expected: string) => Promise<ActionResult<unknown>>;
  field?: string;
  className?: string;
}) {
  const { label, value, field } = props;
  const options: OptionItem[] = [
    { id: "yes", label: "Yes" },
    { id: "no", label: "No" },
  ];
  const save = useFactSave({ kind: "choice", label, value, onSave: props.onSave, options });
  const router = useRouter();
  const lineId = useId();
  const on = save.shown === "yes";
  return (
    <div className={cn("flex min-w-0 flex-1 flex-col", props.className)}>
      <Switch
        aria-label={label}
        aria-describedby={save.error || save.conflict ? lineId : undefined}
        label={on ? "Yes" : "No"}
        isSelected={on}
        onChange={(selected) => save.start(selected ? "yes" : "no", value)}
      />
      {(save.error || save.conflict) && (
        <>
          <FactLine id={lineId} problem={null} save={save} p={{ kind: "choice", field }} inRail />
          <ConflictButtons
            save={save}
            inRail
            onKeep={() => {
              save.reset();
              router.refresh();
            }}
            onSaveMine={() => save.start(value === "yes" ? "no" : "yes", (save.conflict && field ? save.conflict.theirs?.[field] : undefined) ?? "")}
          />
        </>
      )}
    </div>
  );
}
