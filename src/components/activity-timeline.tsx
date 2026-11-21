"use client";
import { useEffect, useState, type ReactNode } from "react";
import { ChevronRight, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import type { TaskStatus } from "@prisma/client";
import { ActivityNow } from "@/components/activity-time";
import { Avatar } from "@/components/avatar";
import { StatusMark } from "@/components/status-badge";
import { cn } from "@/lib/utils";

/**
 * A record's history as one timeline (docs/specs/activity-comments.md 2.1):
 * the task page, the deal page and the contractor's job page. Each entry is
 * a two-column grid, a 20px marker column, a 12px gap, then the content. One
 * 1px --border hairline runs down the center of the marker column behind the
 * markers, and each marker sits on a --background knockout so the line never
 * crosses it. The timeline scrolls with the page; it has no scroll box of
 * its own.
 *
 *   <ActivityTimeline now={now}>
 *     <ActivityItem marker={{ status: "IN_PROGRESS" }}>Connor set status to In progress · …</ActivityItem>
 *     <ActivityItem marker={{ avatar: "Zack Reading", contractor: true }} align="card">…</ActivityItem>
 *   </ActivityTimeline>
 *
 * Children are list items: ActivityItem, ActivityRun, ActivityFold,
 * ActivityDivider, or a plain <li>, 12px apart. No day headings: each entry's time carries its day
 * (docs/specs/activity-collapse.md 3.5). In print the fold controls hide; the
 * hairline and markers print.
 */
export function ActivityTimeline({
  now,
  className,
  children,
}: {
  /** The page's now, for every ActivityTime under it (they agree with the server render). */
  now?: Date | string | number;
  className?: string;
  children: ReactNode;
}) {
  const list = (
    <ol
      className={cn(
        "relative space-y-3",
        // The hairline: a border, so it prints. Centered in the 20px marker column.
        "before:pointer-events-none before:absolute before:inset-y-0 before:left-[calc(0.625rem-0.5px)] before:border-l before:border-border before:content-['']",
        // The dots and knockouts are fills, which print only when asked.
        "print:[-webkit-print-color-adjust:exact] print:[print-color-adjust:exact]",
        className,
      )}
    >
      {children}
    </ol>
  );
  return now != null ? <ActivityNow now={now}>{list}</ActivityNow> : list;
}

/**
 * What sits on the rail for an entry (choice 3.1 B): the author's 20px
 * avatar on a comment (`contractor` draws the square), the StatusMark of the
 * new status on a status change, a 6px --line-strong dot on any other change,
 * the 8px --primary unread dot only on the New divider, or nothing.
 */
export type ActivityMarker =
  | "dot"
  | "unread"
  | "none"
  | { avatar: string; contractor?: boolean }
  | { status: TaskStatus };

/**
 * What the marker centers on: a system line's first text-meta line (18px
 * with a mouse, 20 on touch), a card's header line (1px edge and 10px
 * padding, then the text-body line: 20, 22 on touch), or a folded run's line
 * (its button is 44px tall on touch, so its line sits 12px lower).
 */
export type ActivityAlign = "line" | "card" | "run";

const ROW = "grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-3";

/** An anchored entry clears the sticky app bar, plus 16px (activity 2.6). */
const ANCHOR = "scroll-mt-[calc(var(--app-bar-h)+1rem)]";

function Knockout({ square = false, children }: { square?: boolean; children: ReactNode }) {
  // `relative` so it paints after the rail's positioned ::before and covers the hairline.
  return <span className={cn("relative flex items-center justify-center bg-background p-0.5", square ? "rounded-sm" : "rounded-full")}>{children}</span>;
}

function MarkerGlyph({ marker }: { marker: Exclude<ActivityMarker, "none"> }) {
  if (marker === "dot")
    return (
      <Knockout>
        <span className="size-1.5 rounded-full bg-line-strong" />
      </Knockout>
    );
  if (marker === "unread")
    return (
      <Knockout>
        <span className="size-2 rounded-full bg-primary" />
      </Knockout>
    );
  if ("status" in marker)
    return (
      <Knockout>
        <StatusMark status={marker.status} />
      </Knockout>
    );
  return (
    <Knockout square={marker.contractor}>
      <Avatar name={marker.avatar} size={20} outline={marker.contractor} />
    </Knockout>
  );
}

/** The marker column: the glyph centered on the content's first line. Hidden from screen readers. */
function MarkerCell({ marker, align }: { marker: ActivityMarker; align: ActivityAlign }) {
  return (
    <span aria-hidden="true" className={cn("flex justify-center", align === "card" && "pt-2.75", align === "run" && "pointer-coarse:pt-3")}>
      {marker !== "none" && (
        <span className={cn("flex items-center justify-center", align === "card" ? "h-5 pointer-coarse:h-5.5" : "h-4.5 pointer-coarse:h-5")}>
          <MarkerGlyph marker={marker} />
        </span>
      )}
    </span>
  );
}

/** One entry on the rail: its marker, then its content (a system line, a comment card, a run). */
export function ActivityItem({
  marker = "dot",
  align = "line",
  id,
  className,
  children,
}: {
  marker?: ActivityMarker;
  align?: ActivityAlign;
  /** "update-<eventId>" for an entry a link can open at; it clears the app bar. */
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <li id={id} className={cn(ROW, id && ANCHOR, className)}>
      <MarkerCell marker={marker} align={align} />
      <div className="min-w-0">{children}</div>
    </li>
  );
}

/**
 * A folded run (activity 2.2 c): one line standing for several events. The
 * whole line is a button with aria-expanded, ending in a 16px ChevronRight
 * that turns 90 degrees when open. Its time is plain text, so the button
 * holds no other control. Open, the member lines (`children`, each an
 * ActivityItem with its own marker and time) appear in place under it. At
 * least 32px tall with a mouse (the extra reaches into the gaps, so the line
 * keeps its place) and 44 on touch; it wraps like any sentence, the chevron
 * kept with its last words. Hover --muted with a mouse only.
 */
export function ActivityRun({
  summary,
  time,
  marker = "dot",
  id,
  defaultOpen = false,
  after,
  children,
}: {
  /** The sentence: "Zack checked 14 items", "Connor assigned Zack and made 3 more changes". */
  summary: ReactNode;
  /** The run's time as plain text, after " · ". */
  time?: ReactNode;
  marker?: ActivityMarker;
  id?: string;
  defaultOpen?: boolean;
  /**
   * A control that belongs to the run but not to its toggle ("View previous"
   * on a notes run): it follows the line on the same row, wrapping under it
   * when there is no room. The toggle then takes only its own width.
   */
  after?: ReactNode;
  /** The member lines, shown under the run while it's open. */
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const toggle = (
    <button
      type="button"
      aria-expanded={open}
      onClick={() => setOpen((o) => !o)}
      className={cn(
        "-mx-1.5 block rounded-sm px-1.5 text-left text-meta text-muted-foreground transition-colors hover:bg-muted",
        after ? "max-w-[calc(100%+0.75rem)]" : "w-[calc(100%+0.75rem)]",
        // 32px with a mouse without moving the line; a real 44px row on touch.
        "-my-1.75 min-h-8 py-1.75 pointer-coarse:my-0 pointer-coarse:min-h-11 pointer-coarse:py-3",
      )}
    >
      {summary}
      <span className="whitespace-nowrap">
        {time != null && (
          <>
            <span aria-hidden="true">{" · "}</span>
            {time}
          </>
        )}
        <ChevronRight
          aria-hidden="true"
          className={cn(
            "ml-1 inline-block size-4 align-[-0.1875rem] text-muted-foreground transition-transform duration-fast motion-reduce:transition-none print:hidden",
            open && "rotate-90",
          )}
        />
      </span>
    </button>
  );
  return (
    <>
      <ActivityItem marker={marker} align="run" id={id}>
        {after ? (
          <div className="flex flex-wrap items-baseline gap-x-2">
            {toggle}
            {after}
          </div>
        ) : (
          toggle
        )}
      </ActivityItem>
      {open && children}
    </>
  );
}

/**
 * A collapsed stretch (docs/specs/activity-collapse.md 3.3), drawn the way
 * Linear draws "Show 5 events": an up-down chevron on the rail where a dot
 * would be, then the summary, no time, the whole row one button with
 * aria-expanded. Open, the chevron turns inward, the line reads
 * `openSummary` ("Hide 5 updates") and the rows (`children`) appear under
 * it. With a mouse the row darkens on hover; 44px tall on touch.
 */
export function ActivityFold({
  summary,
  openSummary,
  defaultOpen = false,
  children,
}: {
  /** "Show 5 updates: assignee, due date and Asana move…". */
  summary: ReactNode;
  /** "Hide 5 updates". */
  openSummary: ReactNode;
  defaultOpen?: boolean;
  /** The rows it holds, shown under it while it's open. */
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const Icon = open ? ChevronsDownUp : ChevronsUpDown;
  return (
    <>
      <li className="grid">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className={cn(
            ROW,
            "group -my-1.75 min-h-8 rounded-sm py-1.75 text-left text-meta text-muted-foreground transition-colors hover:text-foreground",
            "pointer-coarse:my-0 pointer-coarse:min-h-11 pointer-coarse:py-3",
          )}
        >
          <span aria-hidden="true" className="flex justify-center">
            <span className="flex h-4.5 items-center justify-center pointer-coarse:h-5">
              <Knockout>
                <Icon className="size-3.5 print:hidden" />
              </Knockout>
            </span>
          </span>
          <span className="min-w-0">{open ? openSummary : summary}</span>
        </button>
      </li>
      {open && children}
    </>
  );
}

/**
 * A rule across the timeline with its label at the start (activity 2.2 e).
 * `unread` is the New divider: the 8px --primary dot on the rail, "New" in
 * text-meta 500 --foreground, and `id="new"` for the rows that link to it.
 * Without it, no marker and the label in --muted-foreground: "Moved from Asana · Oct 29".
 */
export function ActivityDivider({
  unread = false,
  id,
  className,
  children,
}: {
  unread?: boolean;
  /** "new" for the New divider unless given. */
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  const anchor = id ?? (unread ? "new" : undefined);
  // A link to it (a task or job row with news opens at `#new`) shows the page's loading screen
  // first, where the router finds no such id and lets the scroll go, so the divider takes itself
  // into view when it lands. The portal has no app shell to do it (AppShell's hash landing).
  useEffect(() => {
    if (anchor && window.location.hash === `#${anchor}`) document.getElementById(anchor)?.scrollIntoView({ block: "start" });
  }, [anchor]);
  return (
    <li id={anchor} className={cn(ROW, anchor && ANCHOR, className)}>
      <MarkerCell marker={unread ? "unread" : "none"} align="line" />
      <div className="flex h-4.5 min-w-0 items-center gap-2 pointer-coarse:h-5">
        <span className={cn("shrink-0 text-meta", unread ? "font-medium text-foreground" : "text-muted-foreground")}>{children}</span>
        <span aria-hidden="true" className="min-w-0 flex-1 border-t border-border" />
      </div>
    </li>
  );
}
