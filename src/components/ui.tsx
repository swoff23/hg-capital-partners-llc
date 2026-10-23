import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { TableFrame } from "@/components/table-frame";

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
   it. No box and no title bar (Stripe's customer page). */
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
  return (
    <section className={className}>
      <div className="flex min-h-8 items-center justify-between gap-3 border-b border-line pb-2">
        <Heading className="min-w-0 text-section text-fg-1">{title}</Heading>
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
 * Used by the property edit sections and the /settings editors.
 */
export function SectionCard({
  title,
  children,
  onEdit,
  editing,
  actions,
}: {
  title: string;
  children: React.ReactNode;
  onEdit?: () => void;
  editing?: boolean;
  actions?: React.ReactNode;
}) {
  return (
    <Section
      as="h3"
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
                className="opacity-0 transition-[opacity,background-color,color] focus-visible:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100"
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
    "inline-flex items-center justify-center gap-1.5 rounded-md text-label transition-colors disabled:opacity-50 [&_svg]:shrink-0",
    icon ? cn(btnSizes[size].icon, "px-0 pointer-coarse:min-w-11") : btnSizes[size].text,
    TOUCH_HEIGHT,
    btnStyles[variant],
  );
}

export function Button({
  className,
  variant = "primary",
  size = "md",
  icon,
  ...props
}: React.ComponentProps<"button"> & ButtonLook) {
  return <button className={cn(buttonClass({ variant, size, icon }), className)} {...props} />;
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
   Body ink (--fg-1), whatever the sentence's color, with a 1px underline at a
   3px offset, 2px on hover, so it never rests on color alone (WCAG 1.4.1).
   Standalone links known by position or a glyph (breadcrumbs, "Portfolio →",
   "+ Add", Edit) don't use it; they underline on hover. textLinkClass is for
   an <a> or a <button>. */
export const textLinkClass = "text-fg-1 underline decoration-1 underline-offset-3 hover:decoration-2";

export function TextLink({ className, ...props }: React.ComponentProps<typeof Link>) {
  return <Link className={cn(textLinkClass, className)} {...props} />;
}

/* ---------------- Kbd ----------------
   A printed shortcut: "Esc", "⌘K". Touch screens get the same actions as
   visible buttons, so the keycap hides there. */
export function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-line-strong bg-fill-1 px-1 font-mono text-micro text-fg-3 pointer-coarse:hidden",
        className,
      )}
      {...props}
    />
  );
}

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
 * A compact bordered chip that opens a picker (due date, assignee), so a row
 * of them reads as one set. 28px with a mouse; on touch the hit area reaches
 * 44px without the chip growing. Give the element `relative`-friendly room:
 * the hit area is an ::after.
 */
export const pickerChip = cn(
  "relative inline-flex h-7 max-w-full shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-line-strong bg-surface px-2 text-meta font-medium text-fg-1",
  "transition-colors hover:bg-fill-1 data-pressed:bg-fill-1",
  "pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-2",
  "disabled:opacity-50 data-disabled:opacity-50 [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:shrink-0",
);

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

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(fieldClass, "h-9", className)} {...props} />;
}
export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(fieldClass, "py-2", className)} {...props} />;
}
export function Select({ className, ...props }: React.ComponentProps<"select">) {
  return <select className={cn(fieldClass, "h-9", className)} {...props} />;
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
