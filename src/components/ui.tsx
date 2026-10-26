import * as React from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { TableFrame } from "@/components/table-frame";
import { Spinner } from "@/components/spinner";

/* Primitives on the Ink and Limestone tokens (docs/brand-guidelines.md,
   section 9). Colors, type and radii come from the tokens in globals.css, so
   a re-brand is a token swap and nothing here names a hex or palette color. */

/* ---------------- Card ----------------
   Flat: --surface on a --line edge, no shadow. Only for Home and Overview
   modules and public fact tiles; a record's sections use Section. */
export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("rounded-lg border border-line bg-surface", className)} {...props} />;
}
export function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("border-b border-line px-4 py-3", className)} {...props} />;
}
export function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return <h3 className={cn("text-section text-fg-1", className)} {...props} />;
}
export function CardBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("p-4", className)} {...props} />;
}

/* ---------------- Section ----------------
   A heading and its actions over a --line rule, with the content 12px under
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
}: {
  title: React.ReactNode;
  /** Buttons or links at the heading's right end. */
  actions?: React.ReactNode;
  children: React.ReactNode;
  /** The heading level; h2 under the page's h1. */
  as?: "h2" | "h3";
  className?: string;
}) {
  const headingId = React.useId();
  return (
    <section aria-labelledby={headingId} className={className}>
      <div className="flex min-h-[2.5625rem] items-center justify-between gap-3 border-b border-line pb-2">
        <Heading id={headingId} className="min-w-0 text-section text-fg-1">
          {title}
        </Heading>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      <div className="pt-3">{children}</div>
    </section>
  );
}

/**
 * A Section with view and edit modes. In view mode an Edit button (when
 * `onEdit` is set), revealed on hover with a mouse and always shown on touch
 * screens; in edit mode the `actions` slot (Cancel / Save).
 * Used by the property edit sections, a contractor's Contact and the
 * /settings editors. The Edit carries `data-section-edit`, where
 * useSectionSave returns focus when the form closes.
 */
export function SectionCard({
  title,
  children,
  onEdit,
  editing,
  actions,
  as = "h2",
}: {
  title: string;
  children: React.ReactNode;
  onEdit?: () => void;
  editing?: boolean;
  actions?: React.ReactNode;
  /** The heading level; h2 for a record's sections under its h1. */
  as?: "h2" | "h3";
}) {
  return (
    <Section
      as={as}
      title={title}
      className="group"
      actions={
        editing
          ? actions
          : onEdit && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onEdit}
                // useSectionSave puts focus back here when the form closes.
                data-section-edit=""
                // Pulled out by its padding, so the word ends on the section's edge like every other action.
                className="-mr-2.5 opacity-0 transition-[opacity,background-color,color] focus-visible:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100"
              >
                Edit
              </Button>
            )
      }
    >
      {children}
    </Section>
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
  primary: "bg-act text-on-act not-disabled:hover:bg-act-hover not-disabled:active:bg-act-hover",
  secondary: "border border-line-strong bg-surface text-fg-1 not-disabled:hover:bg-fill-1",
  ghost: "text-fg-2 not-disabled:hover:bg-fill-1 not-disabled:hover:text-fg-1",
  danger: "border border-line-strong bg-surface text-danger not-disabled:hover:bg-danger-tint",
  destructive: "bg-danger-fill text-on-danger not-disabled:hover:bg-danger-fill-hover",
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

/* ---------------- Spinner ----------------
   The one loading glyph (lucide LoaderCircle), after 200ms for at least 400ms.
   A client component in its own module; re-exported so primitives come from
   one place. */
export { Spinner };

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
   Body ink (--fg-1), whatever the sentence's color, with a 1px underline at a
   3px offset, 2px on hover, so it never rests on color alone (WCAG 1.4.1).
   Standalone links known by position or an icon (breadcrumbs, Portfolio with
   its arrow, Add with its plus, Edit) don't use it; they underline on hover.
   textLinkClass is for an <a> or a <button>. */
export const textLinkClass = "text-fg-1 underline decoration-1 underline-offset-3 hover:decoration-2";

export function TextLink({ className, ...props }: React.ComponentProps<typeof Link>) {
  return <Link className={cn(textLinkClass, className)} {...props} />;
}

/**
 * The last row of a counted list or an editor's table ("Add unit", "Add
 * appliance"): it adds one more row, so the count is always the rows above
 * it (docs/brand-guidelines.md, section 9 Counted lists). A Plus in --fg-3,
 * the label in --fg-2 at text-label, over the list's --line rule; 40px, 48 on
 * touch. `className` adjusts it, e.g. an inset to line up with a table's text.
 */
export function AddRow({
  children,
  onClick,
  disabled,
  className,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex min-h-10 w-full items-center gap-2 border-t border-line py-2 text-left text-label text-fg-2 transition-colors not-disabled:hover:text-fg-1 disabled:opacity-50 pointer-coarse:min-h-12",
        className,
      )}
    >
      <Plus aria-hidden="true" strokeWidth={1.75} className="h-4 w-4 shrink-0 text-fg-3" />
      {children}
    </button>
  );
}

/* ---------------- Kbd ----------------
   A printed shortcut: "Esc", "⌘K". Touch screens get the same actions as
   visible buttons, so the keycap hides there. */
export const kbdClass =
  "inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-line-strong bg-fill-1 px-1 font-mono text-micro text-fg-3 pointer-coarse:hidden";

export function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return <kbd className={cn(kbdClass, className)} {...props} />;
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
   done or money in. Blue and purple are retired. Neutral sits on --fill-2,
   so it still shows inside a raised layer (a menu, a dialog) in dark. */
export type BadgeTone = "neutral" | "danger" | "warn" | "ok";

const badgeTones: Record<BadgeTone, string> = {
  neutral: "bg-fill-2 text-fg-2",
  danger: "bg-danger-tint text-danger",
  warn: "bg-warn-tint text-warn",
  ok: "bg-ok-tint text-ok",
};

/** A badge tone's ground and text, for an element that can't be a Badge (a status <select>). */
export function badgeToneClass(tone: BadgeTone): string {
  return badgeTones[tone];
}

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
  "relative inline-flex max-w-full shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-line-strong bg-surface px-2 font-medium text-fg-1",
  // The hover fill shows with a mouse only (hover: is under @media (hover: hover)).
  "transition-colors hover:bg-fill-1 data-pressed:bg-fill-1",
  // An empty chip's placeholder ("Due date", "Assign") reads in --fg-3: set data-placeholder on it.
  "data-placeholder:text-fg-3",
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
 * empty chip `data-placeholder` and its words turn --fg-3.
 */
export function pickerChipClass({ size = "row" }: { size?: PickerChipSize } = {}) {
  return cn(pickerChipBase, pickerChipSizes[size]);
}

/** `pickerChipClass()` at the `row` size, the chip every picker drew before the sizes. */
export const pickerChip = pickerChipClass();

/**
 * A picker's trigger at field height, for a form where pickers share a grid
 * with inputs and selects (New task): the field look, --surface on a
 * --line-control edge, 36px with a mouse and 44 on touch, so the grid is one
 * control height. Its text is text-body, the value's icon or avatar leads it
 * and a chevron (`pickerFieldChevron`) ends it in --fg-3, dropped below 360px
 * so a two-column form keeps the value whole ("Connor (me)" at 320). Keyboard
 * focus draws the field's --act edge and inset ring. `pickerChip` is the same
 * trigger in a row of chips.
 */
export const pickerField = cn(
  "relative flex h-9 w-full min-w-0 items-center gap-2 whitespace-nowrap rounded-md border border-line-control bg-surface px-2.5 text-left text-body text-fg-1 outline-none",
  "transition-colors hover:bg-fill-1 data-pressed:bg-fill-1",
  "data-focus-visible:border-act data-focus-visible:ring-1 data-focus-visible:ring-inset data-focus-visible:ring-act",
  "pointer-coarse:h-11 disabled:opacity-50 data-disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
);
export const pickerFieldChevron = "text-fg-3 max-[360px]:hidden";

/* ---------------- Inputs ----------------
   --surface on a --line-control edge. Focus turns the edge --act and adds a
   1px inset --act ring in place of the global outline; aria-invalid turns
   both --danger. */
export const fieldClass = cn(
  "w-full rounded-md border border-line-control bg-surface px-2.5 text-body text-fg-1 outline-none placeholder:text-fg-3",
  "focus:border-act focus:ring-1 focus:ring-inset focus:ring-act",
  "aria-invalid:border-danger aria-invalid:focus:border-danger aria-invalid:focus:ring-danger",
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
  /** Short text inside the field's left edge in --fg-3: "$". */
  prefix?: string;
  /** Short text inside the field's right edge in --fg-3: "%", "sq ft", "/mo", "yrs". */
  suffix?: string;
};

/**
 * A text field. `size` sets its height (`md` 36, `sm` 32; 44 on touch).
 * `prefix` and `suffix` put a unit inside the edge in --fg-3 (forms 2.1); the
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
  const slot = "pointer-events-none absolute top-1/2 -translate-y-1/2 text-body text-fg-3";
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
/** WebKit ignores min-height on a native select, so the select sets its 44px touch height outright. */
export const selectTouchHeight = "pointer-coarse:h-11";

/**
 * A checkbox drawn from the tokens (docs/brand-guidelines.md, section 9): a
 * 16px `rounded-sm` box, `--surface` on a `--line-control` edge; checked, the
 * `--act` fill and edge with an `--on-act` check. A native input underneath
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
          "peer col-start-1 row-start-1 m-0 cursor-pointer appearance-none rounded-sm border border-line-control bg-surface transition-colors checked:border-act checked:bg-act disabled:cursor-default",
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
          "pointer-events-none col-start-1 row-start-1 text-on-act opacity-0 peer-checked:opacity-100",
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
 * `--surface` on a `--line-control` edge; checked, the `--act` fill and edge
 * with an `--on-act` check that springs in at `--dur-check` (selectors 3.10).
 * Hidden from screen readers.
 */
export function CheckboxMark({ checked, className }: { checked: boolean; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-grid size-4 shrink-0 place-items-center rounded-sm border transition-colors duration-check",
        checked ? "border-act bg-act" : "border-line-control bg-surface",
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
          "size-3 text-on-act transition-[opacity,scale] duration-check ease-spring",
          checked ? "scale-100 opacity-100" : "scale-50 opacity-0",
        )}
      >
        <path d="m3.5 8.25 3 3 6-6.5" />
      </svg>
    </span>
  );
}

export function Select({ className, ...props }: React.ComponentProps<"select">) {
  return <select className={cn(fieldClass, "h-9", selectTouchHeight, className)} {...props} />;
}

/**
 * An inline save error: one text-meta --danger line under a section's form or
 * list, or under the field it belongs to (pass its `id` to the field's
 * `aria-describedby`). `role="alert"`, so it's read out when it appears.
 */
export function SaveError({ children, className, id }: { children: React.ReactNode; className?: string; id?: string }) {
  return (
    <p id={id} role="alert" className={cn("text-meta text-danger", className)}>
      {children}
    </p>
  );
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
  "sticky top-[var(--th-top,0px)] z-10 whitespace-nowrap bg-surface px-3 py-2 text-left text-meta font-medium text-fg-3 inset-shadow-rule";

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

/* ---------------- Misc ---------------- */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-title text-balance text-fg-1">{title}</h1>
        {subtitle && <p className="mt-1 text-body text-fg-3">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

/** A label over its value, in a <dl>. An empty value shows the dash glyph in --fg-3. */
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-1.5">
      <dt className="text-meta font-medium text-fg-2">{label}</dt>
      <dd className="mt-0.5 text-body text-fg-1">{children ?? <span className="text-fg-3">—</span>}</dd>
    </div>
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
      <p className="text-pretty text-body text-fg-3">{children}</p>
      {action}
    </div>
  );
}
