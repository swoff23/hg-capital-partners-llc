"use client";
import { useEffect, useState, type ReactNode } from "react";
import { Button as AriaButton } from "react-aria-components";
import { Ellipsis, Lock } from "lucide-react";
import { ActivityItem } from "@/components/activity-timeline";
import { ActivityTime, useActivityNow } from "@/components/activity-time";
import { Menu, MenuHeader, MenuTrigger } from "@/components/menu";
import { Tooltip } from "@/components/tooltip";
import { useCoarsePointer } from "@/components/use-coarse-pointer";
import { buttonClass } from "@/components/ui";
import { fmtDay, fullStamp, seenTime, todayYmdEastern } from "@/lib/dates";
import { firstName } from "@/lib/names";
import { joinNames } from "@/lib/portal/job-view";
import { cn } from "@/lib/utils";

/** Who wrote a comment. */
export interface CommentAuthor {
  /** The label as stored ("Zack (Outlaw Carpentry)", "Connor Swofford"): the avatar's initial and the menu's header line. */
  name: string;
  /** A contractor: the square avatar on the rail, and "contractor" for screen readers. */
  contractor?: boolean;
  /** The viewer wrote it: the header reads "You" (the portal). */
  you?: boolean;
}

export interface CommentCardProps {
  /** The event's id: the entry is `update-<id>`, which job emails and Copy link open at. */
  id: string;
  author: CommentAuthor;
  /** When it was posted. */
  at: Date | string;
  /** When it was last edited; `true` for an imported comment Asana marked edited, with no time. */
  edited?: Date | string | true | null;
  /** Staff only: the --fill-1 card with Lock and "Internal". */
  internal?: boolean;
  /** Imported from an Asana subtask: the checklist item it was on. */
  onItem?: string | null;
  /** The message, pre-wrapped: plain text, or the caller's segments (links, masked codes). */
  body?: ReactNode;
  /** The photos and videos (the uploads strip). */
  media?: ReactNode;
  /** The documents (FilesList). */
  files?: ReactNode;
  /** Files taken off after posting: "1 file removed" in the files slot. */
  removedFiles?: number;
  /** One line under the card, outside it: the delivery line (DeliveryLine) or the failed send's line. */
  footer?: ReactNode;
  /**
   * The comment's menu items (MenuItem, MenuSeparator): Copy link and Copy
   * text on every comment, Edit and Delete on your own (activity 2.5). With
   * a mouse a 32px ghost Ellipsis at the header's end opens them on hover or
   * keyboard focus; the menu leads with the full label and the stamp.
   */
  menuItems?: ReactNode;
  /** Posting: after 200ms the time slot reads "Sending…". */
  sending?: boolean;
}

/**
 * A comment on the timeline (activity 2.2 a), the same card on the staff
 * task page, the contractor's job page and the deal page. The author's 20px
 * avatar sits on the rail (choice 3.1 B), so the header is the first name,
 * the time, "edited" and, for an Internal note, Lock and "Internal" at the
 * trailing edge ("Internal" drops below 480px; the Lock keeps its name).
 * Shared is --surface on a --line edge; Internal is --fill-1 with a
 * transparent edge. rounded-md, 12px by 10px padding.
 */
export function CommentCard({
  id,
  author,
  at,
  edited,
  internal = false,
  onItem,
  body,
  media,
  files,
  removedFiles = 0,
  footer,
  menuItems,
  sending = false,
}: CommentCardProps) {
  const now = useActivityNow();
  const coarse = useCoarsePointer();
  const shown = author.you ? "You" : firstName(author.name) || author.name;
  const editedAt = edited && edited !== true ? edited : null;
  const editedDay = editedAt ? fmtDay(todayYmdEastern(new Date(editedAt)), { year: "auto", now: todayYmdEastern(new Date(now)) }) : null;
  const editedWord = <span className="shrink-0 text-meta text-fg-3">edited</span>;

  return (
    <ActivityItem id={`update-${id}`} marker={{ avatar: author.name, contractor: author.contractor }} align="card">
      <div className={cn("group/card rounded-md border px-3 py-2.5", internal ? "border-transparent bg-fill-1" : "border-line bg-surface")}>
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate text-body font-medium text-fg-1">
            {shown}
            {author.contractor && <span className="sr-only">, contractor</span>}
          </span>
          {sending ? <SendingLabel /> : <ActivityTime at={at} className="shrink-0 text-meta text-fg-3" />}
          {edited &&
            (editedAt && !coarse ? <Tooltip label={`Edited ${fullStamp(editedAt, now)}`}>{editedWord}</Tooltip> : editedWord)}
          {internal && (
            <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-meta font-medium text-fg-2">
              <Lock className="size-3.5" aria-hidden="true" />
              <span className="max-[30rem]:sr-only">Internal</span>
            </span>
          )}
          {menuItems && (
            <MenuTrigger>
              <AriaButton
                aria-label={`Actions for ${author.you ? "your" : `${shown}'s`} comment`}
                className={cn(
                  buttonClass({ variant: "ghost", size: "sm", icon: true }),
                  // 32px without growing the 20px header line; shown on hover or keyboard focus, with a mouse only.
                  "-my-1.5 shrink-0 text-fg-3 data-pressed:bg-fill-1",
                  !internal && "ml-auto",
                  "opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 [@media(hover:none)]:hidden",
                )}
              >
                <Ellipsis className="size-4" aria-hidden="true" />
              </AriaButton>
              <Menu>
                <MenuHeader title={author.name} detail={`${fullStamp(at, now)}${editedDay ? ` · edited ${editedDay}` : ""}`} />
                {menuItems}
              </Menu>
            </MenuTrigger>
          )}
        </div>
        {onItem && <p className="mt-1 truncate text-meta text-fg-3">On checklist item: {onItem}</p>}
        {body != null && body !== "" && <p className="mt-1 whitespace-pre-wrap break-words text-body text-fg-1">{body}</p>}
        {media && <div className="mt-2">{media}</div>}
        {files && <div className="mt-2">{files}</div>}
        {removedFiles > 0 && (
          <p className="mt-2 text-meta text-fg-3">{removedFiles === 1 ? "1 file removed" : `${removedFiles} files removed`}</p>
        )}
      </div>
      {footer && <div className="mt-1">{footer}</div>}
    </ActivityItem>
  );
}

/** "Sending…" in the time slot, after 200ms, so a quick post never flashes it (brand section 7). */
function SendingLabel() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), 200);
    return () => clearTimeout(t);
  }, []);
  return <span className="shrink-0 text-meta text-fg-3">{show ? "Sending…" : ""}</span>;
}

/**
 * What happened to an update after it was posted (activity 2.6): one
 * text-meta --fg-3 line, 4px under the card, on the card's left edge. At
 * most two per timeline. The fixed words stay under 35 characters, and a
 * long name truncates before the line could wrap ("Seen by Maximilian… · Tue").
 *
 *   no-login  "Zack has no login yet"
 *   queued    "Zack gets an email", "Connor and Pieter get an email"
 *   emailed   "Emailed to Zack"
 *   seen      "Seen by Zack · 2:14 PM" (the clock time today, then the
 *             weekday, then the date); "Seen by Pieter" without `at`
 */
export function DeliveryLine({
  state,
  to,
  at,
  className,
}: {
  state: "no-login" | "queued" | "emailed" | "seen";
  /** First names: one person, or the partners an update emails ("Connor and Pieter"). */
  to: string | readonly string[];
  /** When they last opened the record, for `seen`. */
  at?: Date | string | null;
  className?: string;
}) {
  const now = useActivityNow();
  const names = typeof to === "string" ? [to] : [...to];
  const who = joinNames(names);
  const [before, after] = (() => {
    switch (state) {
      case "no-login":
        return ["", " has no login yet"];
      case "queued":
        return ["", names.length > 1 ? " get an email" : " gets an email"];
      case "emailed":
        return ["Emailed to ", ""];
      case "seen":
        return ["Seen by ", at ? ` · ${seenTime(at, now)}` : ""];
    }
  })();
  return (
    <p className={cn("flex min-w-0 text-meta text-fg-3", className)}>
      {before && <span className="shrink-0 whitespace-pre">{before}</span>}
      <span className="min-w-0 truncate">{who}</span>
      {after && <span className="shrink-0 whitespace-pre">{after}</span>}
    </p>
  );
}
