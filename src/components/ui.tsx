import * as React from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { LinkPending } from "@/components/link-pending";
import { TableFrame } from "@/components/table-frame";
import { Spinner } from "@/components/spinner";

/* Primitives on the Ink and Limestone tokens (docs/brand-guidelines.md,
   section 9). Colors, type and radii come from the tokens in globals.css, so
   a re-brand is a token swap and nothing here names a hex or palette color. */

/* ---------------- Card ----------------
   Flat: --background on a --border edge, no shadow. Only for Home and Overview
   modules and public fact tiles; a record's sections use Section. */
export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("rounded-lg border border-border bg-background", className)} {...props} />;
}
export function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("border-b border-border px-4 py-3", className)} {...props} />;
}
export function CardBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("p-4", className)} {...props} />;
}

/* ---------------- Section ----------------
   A heading and its actions over a --border rule, with the content 12px under
   it. No box and no title bar (Stripe's customer page). The heading names
   the <section>, so it's a region screen readers can jump to. The header
   row is 41px with or without a 32px button in it (the button, the 8px under
   it and the 1px rule), so headings side by side line up; on touch a 44px
   button sets its own height. */
export function Section({
  title,
  actions,
  children,
  as: Heading = "h2",
  className,
  id,
}: {
  title: React.ReactNode;
  /** Buttons or links at the heading's right end. */
  actions?: React.ReactNode;
  children: React.ReactNode;
  /** The heading level; h2 under the page's h1. */
  as?: "h2" | "h3";
  className?: string;
  /** An anchor a link can open at (`#lockbox`); the section then stops clear of the sticky app bar. */
  id?: string;
}) {
  const headingId = React.useId();
  return (
    <section id={id} aria-labelledby={headingId} className={cn(id && "scroll-mt-[calc(var(--app-bar-h)+1rem)]", className)}>
      <div className="flex min-h-[2.5625rem] items-center justify-between gap-3 border-b border-border pb-2">
        <Heading id={headingId} className="min-w-0 text-section text-foreground">
          {title}
        </Heading>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      <div className="pt-3">{children}</div>
    </section>
  );
}

/**
 * Touch screens get 44px tap targets; a mouse keeps the compact sizes. A
 * minimum, so a caller's own height still applies wherever it's taller.
 * Exported for controls outside this file (the sidebar's nav items).
 */
export const TOUCH_HEIGHT = "pointer-coarse:min-h-11";

/* ---------------- Button ----------------
   primary: the one next step in a view. secondary: everything else. ghost:
   toolbars and row actions. danger: the first step of a destructive action
   and row menus. destructive: the confirm button only, naming what goes.
   Hover fills apply with a mouse only (Tailwind's hover: is under
   @media (hover: hover)) and never on a disabled button. */
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "destructive";
type ButtonSize = "sm" | "md";

const btnStyles: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground not-disabled:hover:bg-primary-hover not-disabled:active:bg-primary-hover",
  secondary: "border border-line-strong bg-background text-foreground not-disabled:hover:bg-muted",
  ghost: "text-fg-2 not-disabled:hover:bg-muted not-disabled:hover:text-foreground",
  danger: "border border-line-strong bg-background text-destructive not-disabled:hover:bg-destructive-tint",
  destructive: "bg-destructive-fill text-destructive-foreground not-disabled:hover:bg-destructive-fill-hover",
};
const btnSizes: Record<ButtonSize, { text: string; icon: string }> = {
  sm: { text: "h-8 px-2.5", icon: "h-8 w-8" },
  md: { text: "h-9 px-3.5", icon: "h-9 w-9" },
};

type ButtonLook = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Square, for a button that is only an icon (give it an aria-label). */
  icon?: boolean;
};

/** The Button look for an element that isn't a button or a Link: an sms:, tel: or mailto: anchor. */
export function buttonClass({ variant = "secondary", size = "md", icon = false }: ButtonLook = {}) {
  return cn(
    // A label never wraps: shorten the words, or let the layout give it room.
    "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-label transition-colors disabled:opacity-50 [&_svg]:shrink-0",
    icon ? cn(btnSizes[size].icon, "px-0 pointer-coarse:min-w-11") : btnSizes[size].text,
    TOUCH_HEIGHT,
    btnStyles[variant],
  );
}

/**
 * `pending`: the button's action is running. It's disabled and `aria-busy`
 * at once and keeps its label; after 200ms a Spinner appears before the label
 * (in place of the icon on an icon button) and stays at least 400ms (forms
 * 2.7). Never swap the label for "Saving…".
 */
export function Button({
  className,
  variant = "primary",
  size = "md",
  icon,
  pending,
  disabled,
  children,
  ...props
}: React.ComponentProps<"button"> & ButtonLook & { pending?: boolean }) {
  // A button that never takes `pending` renders as it always has. One that
  // does keeps its Spinner mounted, so the spinner can finish its 400ms.
  const busy = pending === true;
  return (
    <button
      className={cn(buttonClass({ variant, size, icon }), className)}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...props}
    >
      {pending === undefined ? (
        children
      ) : icon ? (
        <Spinner active={busy}>{children}</Spinner>
      ) : (
        <>
          <Spinner active={busy} />
          {children}
        </>
      )}
    </button>
  );
}

export function LinkButton({
  className,
  variant = "secondary",
  size = "md",
  icon,
  ...props
}: React.ComponentProps<typeof Link> & ButtonLook) {
  return <Link className={cn(buttonClass({ variant, size, icon }), className)} {...props} />;
}

/* ---------------- TextLink ----------------
   A link its position doesn't mark: inside a sentence, or beside a value or
   label it could pass for (a table cell, a field value, a card header slot).
   Body ink (--foreground), whatever the sentence's color, with a 1px underline at a
   3px offset, 2px on hover, so it never rests on color alone (WCAG 1.4.1).
   Standalone links known by position or an icon (breadcrumbs, Portfolio with
   its arrow, Add with its plus, Edit) don't use it; they underline on hover.
   textLinkClass is for an <a> or a <button>. */
export const textLinkClass = "text-foreground underline decoration-1 underline-offset-3 hover:decoration-2";

export function TextLink({ className, ...props }: React.ComponentProps<typeof Link>) {
  return <Link className={cn(textLinkClass, className)} {...props} />;
}

/**
 * The last row of a counted list or an editor's table ("Add unit", "Add
 * appliance"): it adds one more row, so the count is always the rows above
 * it (docs/brand-guidelines.md, section 9 Counted lists). A Plus in --muted-foreground,
 * the label in --fg-2 at text-label, over the list's --border rule; 40px, 48 on
 * touch. `className` adjusts it, e.g. an inset to line up with a table's text.
 */
/** The foot row's look, shared with the rail's "7 more fields" (components/rail-fold.tsx). */
export const addRowClass =
  "flex min-h-10 w-full items-center gap-2 border-t border-border py-2 text-left text-label text-fg-2 transition-colors not-disabled:hover:text-foreground disabled:opacity-50 pointer-coarse:min-h-12";

export function AddRow({
  children,
  onClick,
  onIntent,
  disabled,
  className,
}: {
  children: React.ReactNode;
  onClick: () => void;
  /** Runs when the pointer reaches the row, it takes focus or it is pressed: warm what the click opens (lib/lazy-module.ts). */
  onIntent?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerEnter={onIntent}
      onFocus={onIntent}
      onPointerDown={onIntent}
      disabled={disabled}
      className={cn(addRowClass, className)}
    >
      <Plus aria-hidden="true" strokeWidth={1.75} className="h-4 w-4 shrink-0 text-muted-foreground" />
      {children}
    </button>
  );
}

/* ---------------- Kbd ----------------
   A printed shortcut: "Esc", "⌘K". Touch screens get the same actions as
   visible buttons, so the keycap hides there. A shortcut prints inside the
   button it triggers, at the trailing edge after the label ("Send ⌘↵",
   "Cancel Esc"), and the button carries aria-keyshortcuts while the keys are
   aria-hidden. On a secondary button the keys keep the keycap above. On a
   primary (--primary) button, where a light keycap would glare, pass
   tone="act": no ground and no edge, just the button's own --primary-foreground at 70%
   (8.5:1 on the ink and 6.9:1 on its hover in light; 6.3:1 and 5.6:1 in
   dark), set 2px further from the label. */
export const kbdClass =
  "inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-line-strong bg-muted px-1 font-mono text-micro text-muted-foreground pointer-coarse:hidden";
export const kbdActClass = "ml-0.5 inline-flex h-5 items-center font-mono text-micro text-primary-foreground/70 pointer-coarse:hidden";

export function Kbd({ tone, className, ...props }: React.ComponentProps<"kbd"> & { tone?: "act" }) {
  return <kbd className={cn(tone === "act" ? kbdActClass : kbdClass, className)} {...props} />;
}

/* ---------------- Tag ----------------
   A neutral chip inside a row or an option ("Has login", "Inactive"): no
   fill, a --line-strong edge, --fg-2, text-micro, 22px (section 9). Not a
   control and not a status, which keeps the Badge tones. */
export const tagClass =
  "inline-flex h-5.5 shrink-0 items-center gap-1 whitespace-nowrap rounded-sm px-2 text-micro text-fg-2 ring-1 ring-inset ring-line-strong";

/* ---------------- Badge ----------------
   One tone map for every badge in the app. Color is state: neutral for a
   label, danger for late or failed, warn for a partner's decision, ok for
   done or money in. Blue and purple are retired. Neutral sits on --accent,
   so it still shows inside a raised layer (a menu, a dialog) in dark. */
export type BadgeTone = "neutral" | "danger" | "warn" | "ok";

const badgeTones: Record<BadgeTone, string> = {
  neutral: "bg-accent text-fg-2",
  danger: "bg-destructive-tint text-destructive",
  warn: "bg-warn-tint text-warn",
  ok: "bg-ok-tint text-ok",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: React.ComponentProps<"span"> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn("inline-flex items-center rounded-sm px-1.5 py-0.5 text-micro", badgeTones[tone], className)}
      {...props}
    />
  );
}

/**
 * A chrome icon (nav items, the shell's buttons, toolbar icons): 16px at a
 * 1.5 stroke with a mouse, 20px at 1.75 on touch (docs/brand-guidelines.md,
 * section 6). Here rather than in nav.tsx, a client module, so server
 * components get the string too.
 */
export const chromeIconClass = "size-4 shrink-0 stroke-[1.5] pointer-coarse:size-5 pointer-coarse:stroke-[1.75]";

export type PickerChipSize = "row" | "sm";

const pickerChipBase = cn(
  "relative inline-flex max-w-full shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-line-strong bg-background px-2 font-medium text-foreground",
  // The hover fill shows with a mouse only (hover: is under @media (hover: hover)).
  "transition-colors hover:bg-muted data-pressed:bg-muted",
  // An empty chip's placeholder ("Due date", "Assign") reads in --muted-foreground: set data-placeholder on it.
  "data-placeholder:text-muted-foreground",
  "disabled:opacity-50 data-disabled:opacity-50 [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:shrink-0",
);

const pickerChipSizes: Record<PickerChipSize, string> = {
  // 28px in a list row (an exception to the 32px sm control, brand section 5);
  // on touch an ::after reaches 44px without the chip growing.
  row: "h-7 text-meta pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-2",
  // 32px in the record rail, create forms and the filter bar; 44 on touch.
  sm: "h-8 text-meta pointer-coarse:h-11",
};

/**
 * A compact bordered chip that opens a picker (due date, assignee, property),
 * so a row of them reads as one set (docs/specs/selectors.md 3.12). `row`
 * for list rows; `sm` for the rail, create forms and filter bars. Give an
 * empty chip `data-placeholder` and its words turn --muted-foreground.
 */
export function pickerChipClass({ size = "row" }: { size?: PickerChipSize } = {}) {
  return cn(pickerChipBase, pickerChipSizes[size]);
}

/**
 * A picker's trigger at field height, for a form where pickers share a grid
 * with inputs and selects (New task): the field look, --background on a
 * --input edge, 36px with a mouse and 44 on touch, so the grid is one
 * control height. Its text is text-body, the value's icon or avatar leads it
 * and a chevron (`pickerFieldChevron`) ends it in --muted-foreground, dropped below 360px
 * so a two-column form keeps the value whole ("Connor (me)" at 320). Keyboard
 * focus draws the field's --ring edge and inset ring. `pickerChipClass` is
 * the same trigger in a row of chips.
 */
export const pickerField = cn(
  "relative flex h-9 w-full min-w-0 items-center gap-2 whitespace-nowrap rounded-md border border-input bg-background px-2.5 text-left text-body text-foreground outline-none",
  "transition-colors hover:bg-muted data-pressed:bg-muted",
  "data-focus-visible:border-ring data-focus-visible:ring-1 data-focus-visible:ring-inset data-focus-visible:ring-ring",
  "pointer-coarse:h-11 disabled:opacity-50 data-disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
);
export const pickerFieldChevron = "text-muted-foreground max-[360px]:hidden";

/* ---------------- Inputs ----------------
   --background on an --input edge. Focus turns the edge --ring and adds a
   1px inset --ring ring in place of the global outline; aria-invalid turns
   both --destructive. */
export const fieldClass = cn(
  "w-full rounded-md border border-input bg-background px-2.5 text-body text-foreground outline-none placeholder:text-muted-foreground",
  "focus:border-ring focus:ring-1 focus:ring-inset focus:ring-ring",
  "aria-invalid:border-destructive aria-invalid:focus:border-destructive aria-invalid:focus:ring-destructive",
  TOUCH_HEIGHT,
);

export type FieldSize = "sm" | "md";

/** Field heights with a mouse: `md` 36px (forms), `sm` 32px (filter bars, table rows, rails). Both are 44 on touch. */
export const fieldSizeClass: Record<FieldSize, string> = { sm: "h-8", md: "h-9" };

// Room for a slot's text: 10px in from the edge, the text (a generous width
// per character, so "%" and "sq ft" clear it), then a 4px gap.
const slotRoom = (text: string) => `calc(0.625rem + ${(text.length * 0.6 + 0.2).toFixed(2)}em + 0.25rem)`;

export type InputProps = Omit<React.ComponentProps<"input">, "size" | "prefix"> & {
  size?: FieldSize;
  /** Short text inside the field's left edge in --muted-foreground: "$". */
  prefix?: string;
  /** Short text inside the field's right edge in --muted-foreground: "%", "sq ft", "/mo", "yrs". */
  suffix?: string;
};

/**
 * A text field. `size` sets its height (`md` 36, `sm` 32; 44 on touch).
 * `prefix` and `suffix` put a unit inside the edge in --muted-foreground (forms 2.1); the
 * text keeps clear of it, the slot is hidden from screen readers and the unit
 * is read through `aria-describedby` instead. With a slot, `className` goes on
 * the wrapper (set widths there); without one, on the input, as before.
 */
export function Input({ className, size = "md", prefix, suffix, style, ...props }: InputProps) {
  const unitId = React.useId();
  if (!prefix && !suffix) {
    return <input className={cn(fieldClass, fieldSizeClass[size], className)} style={style} {...props} />;
  }
  const describedBy = [props["aria-describedby"], unitId].filter(Boolean).join(" ");
  const slot = "pointer-events-none absolute top-1/2 -translate-y-1/2 text-body text-muted-foreground";
  return (
    <span className={cn("relative block", className)}>
      {prefix && (
        <span aria-hidden="true" className={cn(slot, "left-2.5")}>
          {prefix}
        </span>
      )}
      <input
        {...props}
        aria-describedby={describedBy}
        className={cn(fieldClass, fieldSizeClass[size])}
        style={{ ...style, ...(prefix && { paddingLeft: slotRoom(prefix) }), ...(suffix && { paddingRight: slotRoom(suffix) }) }}
      />
      {suffix && (
        <span aria-hidden="true" className={cn(slot, "right-2.5")}>
          {suffix}
        </span>
      )}
      <span id={unitId} className="sr-only">
        {[prefix, suffix].filter(Boolean).join(" ")}
      </span>
    </span>
  );
}
export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(fieldClass, "py-2", className)} {...props} />;
}

/**
 * A checkbox drawn from the tokens (docs/brand-guidelines.md, section 9): a
 * 16px `rounded-sm` box, `--background` on an `--input` edge; checked, the
 * `--primary` fill and edge with a `--primary-foreground` check. A native input underneath
 * (appearance none), so labels, forms and keyboard work as usual, and the box
 * looks the same in every engine and theme instead of the browser's own gray.
 * `large` is 20px, for a checklist worked through on a job site. `className`
 * goes on the wrapper, e.g. a margin.
 */
export function Checkbox({
  className,
  large = false,
  ...props
}: Omit<React.ComponentProps<"input">, "type"> & { large?: boolean }) {
  return (
    // Disabled, the box and its check dim together.
    <span className={cn("inline-grid shrink-0 place-items-center has-disabled:opacity-50", large ? "size-5" : "size-4", className)}>
      <input
        type="checkbox"
        className={cn(
          "peer col-start-1 row-start-1 m-0 cursor-pointer appearance-none rounded-sm border border-input bg-background transition-colors checked:border-primary checked:bg-primary disabled:cursor-default",
          large ? "size-5" : "size-4",
        )}
        {...props}
      />
      <svg
        viewBox="0 0 16 16"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn(
          "pointer-events-none col-start-1 row-start-1 text-primary-foreground opacity-0 peer-checked:opacity-100",
          large ? "size-3.5" : "size-3",
        )}
      >
        <path d="m3.5 8.25 3 3 6-6.5" />
      </svg>
    </span>
  );
}

/**
 * The checkbox's look with no input, for a row that is itself the control
 * (a pick-many option, a filter row): the row carries the state
 * (`aria-selected`, `aria-checked`) and this draws it. 16px `rounded-sm`,
 * `--background` on an `--input` edge; checked, the `--primary` fill and edge
 * with a `--primary-foreground` check that springs in at `--dur-check` (selectors 3.10).
 * Hidden from screen readers.
 */
export function CheckboxMark({ checked, className }: { checked: boolean; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-grid size-4 shrink-0 place-items-center rounded-sm border transition-colors duration-check",
        checked ? "border-primary bg-primary" : "border-input bg-background",
        className,
      )}
    >
      <svg
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn(
          "size-3 text-primary-foreground transition-[opacity,scale] duration-check ease-spring",
          checked ? "scale-100 opacity-100" : "scale-50 opacity-0",
        )}
      >
        <path d="m3.5 8.25 3 3 6-6.5" />
      </svg>
    </span>
  );
}

/**
 * An inline save error: one text-meta --destructive line under a section's form or
 * list, or under the field it belongs to (pass its `id` to the field's
 * `aria-describedby`). `role="alert"`, so it's read out when it appears.
 */
export function SaveError({
  children,
  className,
  id,
  action,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
  /**
   * What the person can do about it ("Load the latest"), after the message.
   * The message truncates and the action never does, so a narrow line cuts
   * its words and keeps the way out. Give the action a 44px touch area.
   */
  action?: React.ReactNode;
}) {
  if (action) {
    return (
      <p id={id} role="alert" className={cn("flex items-baseline gap-1.5 text-meta text-destructive", className)}>
        <span className="min-w-0 truncate">{children}</span>
        <span className="shrink-0">{action}</span>
      </p>
    );
  }
  return (
    <p id={id} role="alert" className={cn("text-meta text-destructive", className)}>
      {children}
    </p>
  );
}

/* ---------------- Form field ----------------
   The label, the control and one line under it (forms 2.0 and 2.2). Named
   FormField because Field is the label-over-value display pair. */

/** What a FormField hands its control, so `Input`, `NumberInput`, `Select` and the rest wire up the same way. */
export type FormFieldControlProps = {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
  "aria-required"?: true;
};

/**
 * A form field: the label above (`text-meta` 500 `--fg-2`, 6px over the
 * control), then the control, then one `text-meta` line: the helper in
 * `--muted-foreground`, or the error in `--destructive` in its place. Optional fields say
 * "(optional)" after the label in `--muted-foreground`; required ones show nothing and
 * set `aria-required`. No asterisks. The render prop hands the control its
 * `id`, `aria-describedby`, `aria-invalid` and `aria-required`; the label
 * points at the `id`, so clicking it focuses the control.
 *
 *   <FormField label="Asking price" optional helper="Shown on the deal" error={fieldErrors?.theirPriceRaw}>
 *     {(p) => <NumberInput kind="money" name="theirPriceRaw" {...p} />}
 *   </FormField>
 *
 * The line never wraps: write the helper to fit the field's width. Nothing
 * is red before the first try; pass `error` once the form has been sent or
 * the field left with a bad format (forms 2.0, Timing). On the public
 * surface the tokens draw it dark.
 */
export function FormField({
  label,
  optional = false,
  required = false,
  helper,
  error,
  id: idProp,
  hideLabel = false,
  className,
  children,
}: {
  label: React.ReactNode;
  /** Adds "(optional)" after the label. */
  optional?: boolean;
  /** Sets `aria-required` on the control. Nothing shows. */
  required?: boolean;
  /** One line under the control: who sees it or what happens ("Adds a reminder 60 days before"). */
  helper?: React.ReactNode;
  /**
   * One plain line saying what to enter ("Enter the address."); replaces the
   * helper and marks the control invalid. A string almost always; a node when
   * the line carries a link ("767 Prospect Ave is already a property. Open it").
   */
  error?: React.ReactNode;
  /** The control's id; one is made when it's left out. */
  id?: string;
  /** Keep the label for screen readers only (a field whose sheet title already names it). */
  hideLabel?: boolean;
  className?: string;
  children: (control: FormFieldControlProps) => React.ReactNode;
}) {
  const made = React.useId();
  const id = idProp ?? `${made}-field`;
  const lineId = `${id}-line`;
  const invalid = error !== undefined && error !== null && error !== false && error !== "";
  const line = invalid ? error : helper;
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={id} className={cn("text-meta font-medium text-fg-2", hideLabel && "sr-only")}>
        {label}
        {optional && <span className="font-normal text-muted-foreground"> (optional)</span>}
      </label>
      {children({
        id,
        ...(line ? { "aria-describedby": lineId } : {}),
        ...(invalid ? { "aria-invalid": true as const } : {}),
        ...(required ? { "aria-required": true as const } : {}),
      })}
      {line && (
        <p id={lineId} className={cn("truncate text-meta", invalid ? "text-destructive" : "text-muted-foreground")}>
          {line}
        </p>
      )}
    </div>
  );
}

/**
 * Two fields side by side from sm, one column below it (forms 2.2): only for
 * short, related values whose labels both fit on one line (City and ZIP, the
 * two deal prices, Beds and Baths). 16px between them either way.
 */
export function FieldRow({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("grid gap-4 sm:grid-cols-2", className)} {...props} />;
}

/* ---------------- Table ----------------
   The page scrolls, not the table; a table wider than its column scrolls
   sideways in its own box (TableFrame), so it never widens the page. While
   the table fits, Th sticks under the app bar. A caller's wrapper must not
   scroll or hide overflow, or the header can't stick: clip a card's corners
   with overflow-clip, not overflow-hidden. */
export function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <TableFrame>
      <table className={cn("w-full text-body", className)} {...props} />
    </TableFrame>
  );
}

/**
 * A header cell's look, for a header that can't be a Th (the deals sort
 * header). It's already positioned (sticky), so a resize handle inside needs
 * no `relative`, which would replace the sticky.
 */
export const thClass =
  "sticky top-[var(--th-top,0px)] z-10 whitespace-nowrap bg-background px-3 py-2 text-left text-meta font-medium text-muted-foreground inset-shadow-rule";

/** `numeric` right-aligns the cell and sets tabular figures, for money and count columns. */
export function Th({ className, numeric, ...props }: React.ComponentProps<"th"> & { numeric?: boolean }) {
  return <th className={cn(thClass, numeric && "text-right tabular-nums", className)} {...props} />;
}
export function Td({ className, numeric, ...props }: React.ComponentProps<"td"> & { numeric?: boolean }) {
  return (
    <td
      className={cn(
        // Rows of 40px with a mouse and 48px on touch for a line of text-body.
        "px-3 py-2.5 align-top pointer-coarse:h-12 pointer-coarse:py-3",
        numeric && "whitespace-nowrap text-right tabular-nums",
        className,
      )}
      {...props}
    />
  );
}

/* ---------------- Statement rules (section 3) ----------------
   A table on a finance screen sits flush with the page gutter: its first and
   last cells drop their outer padding, so the h1, the header and column one
   share an edge (`flushTable`). A grand total (portfolio NOI, the rent roll
   total, a CapEx forecast's total, a breakdown's net) takes a --foreground rule
   above, a 3px double rule below and weight 600 (`grandTotalRow`, on the row
   or on each cell); the 1px top edge of a double border draws as a single
   line. A subtotal row, when one comes, is a --line-strong rule above at
   weight 600. */
export const flushTable = "[&_tr>*:first-child]:pl-0 [&_tr>*:last-child]:pr-0";
export const grandTotalRow = "border-t border-b-3 border-double border-foreground font-semibold";

/* ---------------- Misc ---------------- */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  /** A line under the title; a loading screen passes a `Block` for one that comes from data. */
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-title text-balance text-foreground">{title}</h1>
        {subtitle && <p className="mt-1 text-body text-muted-foreground">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

/**
 * A row's hover fill while one of its links waits on a page that wasn't
 * prefetched (`LinkPending` in the link), on the element that carries the
 * row's hover fill (docs/specs/performance.md 4.6).
 */
export const pendingRowFill = "has-[[data-link-pending]]:bg-muted";

/**
 * One cell of a table row that is itself a link to a record, so the whole row
 * opens it (properties, deals). The first cell's link wraps its content, takes
 * focus and names the row. Every other cell keeps its value outside the link
 * and lays the same link over itself, out of the tab order and hidden from
 * screen readers, so a mouse or a tap anywhere opens the row and the value
 * still reads. A single link stretched over the row would need the row as its
 * containing block, which not every engine gives a table row; a cell is one.
 * A control in such a cell (a stage menu) sits in `relative z-10`, above that
 * link. Every link carries `LinkPending`, so the row's `tr` takes
 * `pendingRowFill` beside its hover fill. 56px with a mouse, 60 on touch
 * (section 5 Density); a denser table
 * passes `min-h-10 pointer-coarse:min-h-12` in `className`. `cell` styles the
 * cell (when it drops, the first column's width); `className` its content,
 * with pl-0 and pr-0 putting the edge cells on the gutter. `aside` is
 * positioned over the first cell beside its link, for a control that can't sit
 * inside it (a link nested in a link is invalid).
 */
export function RowCell({
  href,
  first = false,
  numeric = false,
  cell,
  className,
  aside,
  children,
}: {
  href: string;
  first?: boolean;
  numeric?: boolean;
  cell?: string;
  className?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  const content = cn(
    "flex min-h-14 items-center gap-3 px-3 pointer-coarse:min-h-15",
    numeric && "justify-end",
    className,
  );
  return (
    <Td
      numeric={numeric}
      className={cn("p-0 align-middle pointer-coarse:h-auto pointer-coarse:p-0", (!first || aside) && "relative", cell)}
    >
      {first ? (
        <>
          <Link href={href} className={cn(content, "-outline-offset-2")}>
            {children}
            <LinkPending />
          </Link>
          {aside}
        </>
      ) : (
        <>
          <div className={content}>{children}</div>
          <Link href={href} tabIndex={-1} aria-hidden="true" className="absolute inset-0">
            <LinkPending />
          </Link>
        </>
      )}
    </Td>
  );
}

/** One sentence saying what happens next, and at most one action under it. No box. */
export function EmptyState({
  children,
  action,
  className,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-3 px-4 py-8 text-center", className)}>
      <p className="text-pretty text-body text-muted-foreground">{children}</p>
      {action}
    </div>
  );
}
