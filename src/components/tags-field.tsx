"use client";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button as AriaButton } from "react-aria-components";
import { OptionList } from "@/components/option-list";
import { PickerLayer } from "@/components/picker-layer";
import { Button, SaveError, fieldClass, tagClass } from "@/components/ui";
import type { PickContainer } from "@/components/use-coarse-pointer";
import { cn } from "@/lib/utils";

/**
 * Pick many from a list that can grow (docs/specs/contractor-trades.md 4):
 * a record's values as tags, and one search checklist to change them, the
 * same rows the filters use. A contractor's trades are the first; any later
 * pick-many field uses these too.
 *
 *   <TagsField label="Trades" options={trades} value={picked} onChange={setPicked} placeholder="Add trades" normalize={tradeName} />
 *   <TagOverflow tags={["HVAC", "Plumbing", "Tile"]} />          // a list's cell: one line, then "+2"
 *
 * Values are their own names, so a name is unique ignoring case. On a record
 * the inline field (`InlineTags` in inline-field.tsx) holds the picks until
 * the checklist closes and saves once.
 */

/** A to Z, ignoring case. */
const az = (a: string, b: string) => a.localeCompare(b, "en", { sensitivity: "base" });

/** Values on one line, A to Z: "HVAC, Plumbing". How a record's picks travel as text (a save, a conflict, Undo). */
export function tagsLine(values: readonly string[]): string {
  return [...values].sort(az).join(", ");
}

/** The values in a line `tagsLine` wrote, A to Z. */
export function tagsOf(line: string): string[] {
  return line
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .sort(az);
}

/** The space between tags, in px: Tailwind's gap-1. */
const GAP = 4;

/** Tags that wrap: a record's values at rest. A long one ends in an ellipsis rather than pushing past its column. */
export function TagList({ tags, className }: { tags: readonly string[]; className?: string }) {
  return (
    <span className={cn("flex min-w-0 flex-wrap gap-1", className)}>
      {tags.map((t) => (
        <span key={t} className={cn(tagClass, "max-w-full")}>
          <span className="truncate">{t}</span>
        </span>
      ))}
    </span>
  );
}

/**
 * One line of tags, as many whole ones as fit, then "+N" for the rest (a
 * list's cell; Attio's tables). It measures every tag in a hidden copy and
 * again whenever its width changes. Before that it shows the first tag and
 * "+N", so the first paint never runs past the cell. It takes the width its
 * parent gives it and adds none of its own, so a table column sizes from its
 * header (give that a width) and never grows to fit the tags. A screen reader
 * hears every tag.
 */
export function TagOverflow({ tags, className }: { tags: readonly string[]; className?: string }) {
  const box = useRef<HTMLSpanElement>(null);
  const meter = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(Math.min(1, tags.length));
  const key = tags.join("\u0000");

  useLayoutEffect(() => {
    const el = box.current;
    const m = meter.current;
    if (!el || !m) return;
    const fit = () => {
      const room = el.clientWidth;
      const kids = [...m.children] as HTMLElement[];
      const widths = kids.slice(0, tags.length).map((k) => k.offsetWidth);
      const plus = kids[tags.length]?.offsetWidth ?? 0;
      let used = 0;
      let n = 0;
      for (let i = 0; i < widths.length; i++) {
        const next = used + (i > 0 ? GAP : 0) + widths[i];
        const rest = widths.length - (i + 1);
        if (next + (rest > 0 ? GAP + plus : 0) > room) break;
        used = next;
        n++;
      }
      // The first tag always shows; when even it doesn't fit it ends in an ellipsis.
      setShown(Math.max(1, n));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (tags.length === 0) return null;
  const hidden = tags.length - shown;
  return (
    <span ref={box} className={cn("relative flex w-0 min-w-full items-center gap-1 overflow-hidden whitespace-nowrap", className)}>
      <span className="sr-only">{tags.join(", ")}</span>
      <span aria-hidden="true" className="contents">
        {tags.slice(0, shown).map((t, i) => (
          <span key={t} className={cn(tagClass, i === 0 && "min-w-0 shrink")}>
            <span className="truncate">{t}</span>
          </span>
        ))}
        {hidden > 0 && <span className="shrink-0 text-meta tabular-nums text-muted-foreground">+{hidden}</span>}
      </span>
      {/* Every tag and the widest "+N", laid out off-screen to be measured. */}
      <span ref={meter} aria-hidden="true" className="pointer-events-none invisible absolute left-0 top-0 flex gap-1">
        {tags.map((t) => (
          <span key={t} className={tagClass}>
            {t}
          </span>
        ))}
        <span className="text-meta tabular-nums">+{tags.length}</span>
      </span>
    </span>
  );
}

/**
 * The checklist inside the popover or sheet: a search, the values picked
 * when it opened first (so a tick never moves a row), then the rest A to Z,
 * and with `normalize` an 'Add "Roofing"' row for a value the list doesn't
 * have. A new value is ticked at once and joins the list for this open.
 */
export function TagsChecklist({
  label,
  options,
  value,
  onChange,
  normalize,
  emptyText,
  container,
  onTab,
}: {
  label: string;
  options: readonly string[];
  value: readonly string[];
  onChange: (next: string[]) => void;
  /** Turns typed text into a new value's name ("roofing" to "Roofing"); null refuses it. Without it, nothing can be added. */
  normalize?: (text: string) => string | null;
  emptyText?: string;
  container: PickContainer;
  onTab?: () => void;
}) {
  const [order] = useState(() => {
    const picked = new Set(value.map((v) => v.toLowerCase()));
    return [...[...value].sort(az), ...options.filter((o) => !picked.has(o.toLowerCase())).sort(az)];
  });
  const [added, setAdded] = useState<string[]>([]);
  const known = new Set(order.map((o) => o.toLowerCase()));
  const items = [...order, ...added.filter((a) => !known.has(a.toLowerCase()))].map((n) => ({ id: n, label: n }));

  return (
    <OptionList
      aria-label={label}
      selectionMode="multiple"
      container={container}
      items={items}
      selectedKeys={value}
      onSelectionChange={onChange}
      onTab={onTab}
      searchLabel={`Search ${label.toLowerCase()}`}
      emptyText={emptyText}
      revealPicked={false}
      createName={normalize}
      onCreate={
        normalize
          ? (name) => {
              const existing = items.find((o) => o.label.toLowerCase() === name.toLowerCase());
              const pick = existing?.label ?? name;
              if (!existing) setAdded((a) => [...a, name]);
              if (!value.some((v) => v.toLowerCase() === pick.toLowerCase())) onChange([...value, pick]);
            }
          : undefined
      }
    />
  );
}

/** The phone sheet's Done, pinned under the checklist. */
export function DoneFooter({ close }: { close: () => void }) {
  return (
    <Button className="w-full" onClick={close}>
      Done
    </Button>
  );
}

/**
 * Pick many in a form: a field with the label above it that shows the picks
 * as tags (or the placeholder) and opens the checklist under it, or a sheet
 * on a phone. Each tick changes `value` at once; the form saves them with
 * everything else.
 */
export function TagsField({
  label,
  options,
  value,
  onChange,
  placeholder,
  normalize,
  emptyText,
  isInvalid,
  errorMessage,
  className,
}: {
  label: string;
  options: readonly string[];
  value: readonly string[];
  onChange: (next: string[]) => void;
  /** The field's words with nothing picked: "Add trades". */
  placeholder: string;
  normalize?: (text: string) => string | null;
  emptyText?: string;
  isInvalid?: boolean;
  errorMessage?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ids = useId();
  const labelId = `${ids}-label`;
  const valueId = `${ids}-value`;
  const errorId = `${ids}-error`;
  const shown = [...value].sort(az);

  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <span id={labelId} className="text-meta font-medium text-fg-2">
        {label}
      </span>
      <PickerLayer
        isOpen={open}
        onOpenChange={setOpen}
        title={label}
        popoverClassName="min-w-[min(var(--trigger-width),20rem)] max-w-80"
        sheetFooter={(close) => <DoneFooter close={close} />}
        trigger={
          <AriaButton
            aria-labelledby={`${labelId} ${valueId}`}
            aria-haspopup="listbox"
            aria-invalid={isInvalid || undefined}
            aria-describedby={isInvalid && errorMessage ? errorId : undefined}
            className={cn(
              fieldClass,
              "flex min-h-9 items-center gap-2 py-1 text-left",
              "data-pressed:border-primary data-pressed:ring-1 data-pressed:ring-inset data-pressed:ring-primary",
            )}
          >
            <span id={valueId} className="flex min-w-0 flex-1">
              {shown.length > 0 ? <TagList tags={shown} /> : <span className="truncate text-muted-foreground">{placeholder}</span>}
            </span>
            <ChevronDown aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
          </AriaButton>
        }
      >
        {({ container, close }) => (
          <TagsChecklist
            label={label}
            options={options}
            value={value}
            onChange={onChange}
            normalize={normalize}
            emptyText={emptyText}
            container={container}
            onTab={close}
          />
        )}
      </PickerLayer>
      {isInvalid && errorMessage && <SaveError id={errorId}>{errorMessage}</SaveError>}
    </div>
  );
}
