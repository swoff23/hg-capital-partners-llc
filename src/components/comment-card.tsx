"use client";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { Button as AriaButton } from "react-aria-components";
import { Ellipsis, Lock } from "lucide-react";
import { ActivityItem } from "@/components/activity-timeline";
import { ActivityTime, useActivityNow } from "@/components/activity-time";
import { Menu, MenuHeader, MenuTrigger } from "@/components/menu";
import { Tooltip } from "@/components/tooltip";
import { useCoarsePointer } from "@/components/use-coarse-pointer";
import { Button, Kbd, TextLink, buttonClass, textLinkClass } from "@/components/ui";
import { shortcutLabel, useModKey } from "@/components/use-platform";
import { callAction, type ActionResult } from "@/lib/action-result";
import { fmtDay, fullStamp, seenTime, todayYmdEastern } from "@/lib/dates";
import { firstName } from "@/lib/names";
import { joinNames } from "@/lib/portal/job-view";
import type { BodySegment } from "@/lib/tasks/body-links";
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
  /**
   * Who wrote it. Null when the record doesn't say (a line from the deals
   * sheet): no avatar on the rail, a dot, and no name in the header. A name
   * is never made up.
   */
  author: CommentAuthor | null;
  /** What the card is called in its menu's name and header: "comment" on a task, "note" on a deal. */
  noun?: "comment" | "note";
  /** When it was posted. */
  at: Date | string;
  /** Under a month heading: the time slot reads the day ("Oct 3"). */
  month?: boolean;
  /** When it was last edited; `true` for an imported comment Asana marked edited, with no time. */
  edited?: Date | string | true | null;
  /** Staff only: the --fill-1 card with Lock and "Internal". */
  internal?: boolean;
  /** Imported from an Asana subtask: the checklist item it was on. */
  onItem?: string | null;
  /** The message, pre-wrapped: plain text, or the caller's segments (CommentBody). */
  body?: ReactNode;
  /** Edit in place: replaces the body while it is open (CommentEditor). */
  editor?: ReactNode;
  /** The photos and videos (the uploads strip). */
  media?: ReactNode;
  /** The documents (FilesList). */
  files?: ReactNode;
  /** Files taken off after posting: "1 file removed" in the files slot. */
  removedFiles?: number;
  /** One line under the card, outside it: the delivery line (DeliveryLine) or the failed send's line (SendFailedLine). */
  footer?: ReactNode;
  /**
   * The comment's menu items (MenuItem, MenuSeparator): Copy link and Copy
   * text on every comment, Edit and Delete on your own (activity 2.5). With a
   * mouse a 32px ghost Ellipsis at the header's end opens them on hover or
   * keyboard focus. On touch nothing is drawn: a tap on the card (not on its
   * links, photos or files) opens the same menu, and a visually hidden
   * trigger keeps it reachable for VoiceOver and Switch Control (choice 3.2
   * B). The menu leads with the full label and the stamp.
   */
  menuItems?: ReactNode;
  /** Posting: after 200ms the time slot reads "Sending…". */
  sending?: boolean;
  /** Where the entry id sits, when the card is not a timeline entry of its own (inside a decision pair). */
  bare?: boolean;
  /**
   * Take focus when the card appears with this on, or when it turns on, on its menu button (the card itself
   * without a menu): an Undo that brings a deleted comment back puts a keyboard user where the deleted line was,
   * not at the top of the page.
   */
  focusOnMount?: boolean;
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
  noun = "comment",
  at,
  month = false,
  edited,
  internal = false,
  onItem,
  body,
  editor,
  media,
  files,
  removedFiles = 0,
  footer,
  menuItems,
  sending = false,
  bare = false,
  focusOnMount = false,
}: CommentCardProps) {
  const now = useActivityNow();
  const coarse = useCoarsePointer();
  const [menuOpen, setMenuOpen] = useState(false);
  const shown = author ? (author.you ? "You" : firstName(author.name) || author.name) : null;
  const editedAt = edited && edited !== true ? edited : null;
  const timed = at !== "" && at != null;
  // Nothing to say in the header (a line from the sheet: no name, no time): the row is dropped and the menu's button sits in the corner.
  const headerless = !shown && !sending && !timed && !edited && !internal;
  const cardRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Closing the editor removes the field that had focus: put it back on the card's menu button, or the card itself.
  const editing = !!editor;
  const wasEditing = useRef(false);
  useEffect(() => {
    if (wasEditing.current && !editing) (triggerRef.current ?? cardRef.current)?.focus();
    wasEditing.current = editing;
  }, [editing]);
  useEffect(() => {
    if (focusOnMount) (triggerRef.current ?? cardRef.current)?.focus();
  }, [focusOnMount]);
  const editedDay = editedAt ? fmtDay(todayYmdEastern(new Date(editedAt)), { year: "auto", now: todayYmdEastern(new Date(now)) }) : null;
  const editedWord = <span className="shrink-0 text-meta text-fg-3">edited</span>;

  const trigger = menuItems ? (
    <MenuTrigger isOpen={menuOpen} onOpenChange={setMenuOpen}>
      <AriaButton
        ref={triggerRef}
        aria-label={author ? `Actions for ${author.you ? "your" : `${shown}'s`} ${noun}` : `Actions for imported ${noun}`}
        className={cn(
          buttonClass({ variant: "ghost", size: "sm", icon: true }),
          // 32px without growing the 20px header line; shown on hover or keyboard focus, with a mouse only.
          "-my-1.5 shrink-0 text-fg-3 data-pressed:bg-fill-1",
          headerless ? "absolute right-1.5 top-1.5 my-0" : !internal && "ml-auto",
          "opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100",
          // On touch it is not drawn, but stays a real button for VoiceOver and Switch Control. It sits at the
          // header's end, so the menu opens under the card's edge and not at the screen's.
          "[@media(hover:none)]:sr-only [@media(hover:none)]:right-0 [@media(hover:none)]:focus-visible:not-sr-only [@media(hover:none)]:focus-visible:opacity-100",
        )}
      >
        <Ellipsis className="size-4" aria-hidden="true" />
      </AriaButton>
      <Menu>
        <MenuHeader title={author ? author.name : `Imported ${noun}`} detail={`${timed ? fullStamp(at, now) : ""}${editedDay ? `${timed ? " · " : ""}edited ${editedDay}` : ""}`} />
        {menuItems}
      </Menu>
    </MenuTrigger>
  ) : null;

  const card = (
    <div
      ref={cardRef}
      tabIndex={-1}
      // A tap on the card opens its menu on touch; a mouse does nothing on click, so text stays selectable.
      onClick={(e) => {
        if (!menuItems || !coarse || editor) return;
        if ((e.target as HTMLElement).closest("a, button, input, textarea, select, label, video, [role='button'], [role='menuitem']")) return;
        if (window.getSelection()?.toString()) return;
        setMenuOpen(true);
      }}
      className={cn("group/card relative rounded-md border px-3 py-2.5 outline-none", internal ? "border-transparent bg-fill-1" : "border-line bg-surface")}
    >
      {headerless ? (
        trigger
      ) : (
        <div className="relative flex min-w-0 items-center gap-2">
          {shown && (
            <span className="min-w-0 truncate text-body font-medium text-fg-1">
              {shown}
              {author?.contractor && !author.you && <span className="sr-only">, contractor</span>}
            </span>
          )}
          {sending ? <SendingLabel /> : timed ? <ActivityTime at={at} month={month} className="shrink-0 text-meta text-fg-3" /> : null}
          {edited && (editedAt && !coarse ? <Tooltip label={`Edited ${fullStamp(editedAt, now)}`}>{editedWord}</Tooltip> : editedWord)}
          {internal && (
            <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-meta font-medium text-fg-2">
              <Lock className="size-3.5" aria-hidden="true" />
              <span className="max-[30rem]:sr-only">Internal</span>
            </span>
          )}
          {trigger}
        </div>
      )}
      {onItem && <p className="mt-1 truncate text-meta text-fg-3">On checklist item: {onItem}</p>}
      {editor ? (
        <div className="mt-1.5">{editor}</div>
      ) : (
        body != null &&
        body !== "" && <p className={cn("whitespace-pre-wrap break-words text-body text-fg-1", headerless ? "pointer-fine:pr-7" : "mt-1")}>{body}</p>
      )}
      {media && <div className="mt-2">{media}</div>}
      {files && <div className="mt-2">{files}</div>}
      {removedFiles > 0 && (
        <p className="mt-2 text-meta text-fg-3">{removedFiles === 1 ? "1 file removed" : `${removedFiles} files removed`}</p>
      )}
    </div>
  );

  if (bare) {
    return (
      <div id={`update-${id}`} className="scroll-mt-[calc(var(--app-bar-h)+1rem)]">
        {card}
        {footer && <div className="mt-1">{footer}</div>}
      </div>
    );
  }
  return (
    <ActivityItem id={`update-${id}`} marker={author ? { avatar: author.name, contractor: author.contractor } : "dot"} align="card">
      {card}
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
 * A comment's body as text with links (activity 2.2 a): https addresses open
 * in a new tab and `/tasks/<id>` paths go to the task (lib/tasks/body-links.ts
 * makes the segments). Nothing else is formatted.
 */
export function CommentBody({ segments }: { segments: readonly BodySegment[] }) {
  return (
    <>
      {segments.map((seg, i) =>
        seg.type === "text" ? (
          <Fragment key={i}>{seg.text}</Fragment>
        ) : seg.type === "link" ? (
          <a key={i} href={seg.href} target="_blank" rel="noopener noreferrer" className={cn(textLinkClass, "break-all")}>
            {seg.text}
          </a>
        ) : (
          <TextLink key={i} href={seg.href}>
            {seg.text}
          </TextLink>
        ),
      )}
    </>
  );
}

/**
 * Edit in place (activity 2.5): the body swaps for an autogrowing field with
 * the caret at the end, and one line under it only when it matters ("Zack
 * already got the first version", "Zack gets the edited version"). Cancel
 * (ghost) with Esc, Save (secondary) with the mod key and Enter; no primary
 * in edit mode, so nothing sits disabled without a reason. Saving unchanged
 * text just closes it; saving nothing, with no files, says so in one line.
 * Esc cancels the edit only. While it is open a phone's pinned composer hides,
 * so there is one field and one keyboard.
 */
export function CommentEditor({
  initial,
  note,
  hasFiles = false,
  noun = "comment",
  onSave,
  onCancel,
}: {
  initial: string;
  /** Under the field: what the email did or will do with the edit. */
  note?: string | null;
  /** The comment keeps files, so emptying the words is allowed. */
  hasFiles?: boolean;
  /** What the field and its refusal call it: "comment", or "note" on a deal ("Add some text, or delete the note"). */
  noun?: "comment" | "note";
  onSave: (body: string) => Promise<ActionResult<unknown>>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const mod = useModKey();

  useEffect(() => {
    const el = field.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    document.documentElement.dataset.editingComment = "true";
    return () => {
      delete document.documentElement.dataset.editingComment;
    };
  }, []);

  // Grow with the text.
  useEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  async function save() {
    if (saving) return;
    const next = value.trim();
    if (next === initial.trim()) return onCancel();
    if (!next && !hasFiles) return setError(`Add some text, or delete the ${noun}`);
    setSaving(true);
    setError(null);
    const res = await callAction(() => onSave(next));
    setSaving(false);
    if (res.ok) onCancel();
    else setError(res.error);
  }

  return (
    <div className="space-y-2">
      <textarea
        ref={field}
        aria-label={`Edit ${noun}`}
        rows={1}
        value={value}
        maxLength={20_000}
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
        }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onCancel();
          } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void save();
          }
        }}
        className="block max-h-60 min-h-9 w-full resize-none rounded-md border border-line-control bg-surface px-2.5 py-2 text-body text-fg-1 outline-none focus:border-act"
      />
      {note && <p className="truncate text-meta text-fg-3">{note}</p>}
      {error && (
        <p role="alert" className="text-meta text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} aria-keyshortcuts="Escape">
          Cancel
          <Kbd aria-hidden="true">Esc</Kbd>
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => void save()} pending={saving} aria-keyshortcuts="Meta+Enter Control+Enter">
          Save
          <Kbd aria-hidden="true">{shortcutLabel(mod, "↵")}</Kbd>
        </Button>
      </div>
    </div>
  );
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

/**
 * A message that didn't go (activity 2.7): one `--danger` text-meta line under
 * its card, built from what the call said. "Didn't send: no connection ·
 * Retry" offline, "Didn't send · Retry" otherwise; a deal note says "save".
 * Retry sends the same text, visibility, files and `clientId`, so nothing
 * posts twice. A refusal no Retry can change (`reason`, from
 * lib/composer-draft.ts sendRefusal) is said in Retry's place: "Didn't send ·
 * Shorten it to 20,000 characters.", and the card's Edit is the way on.
 */
export function SendFailedLine({
  offline = false,
  reason,
  verb = "send",
  onRetry,
  className,
}: {
  offline?: boolean;
  /** The server's refusal in its own words, when trying again can't help: shown instead of Retry. */
  reason?: string | null;
  /** "save" for a deal note. */
  verb?: "send" | "save";
  onRetry: () => void;
  className?: string;
}) {
  if (reason) {
    return (
      <p role="alert" className={cn("flex min-w-0 items-center gap-1 text-meta text-danger", className)}>
        <span className="shrink-0">{`Didn't ${verb}`}</span>
        <span aria-hidden="true">·</span>
        <span className="truncate" title={reason}>
          {reason}
        </span>
      </p>
    );
  }
  return (
    <p role="alert" className={cn("flex min-w-0 items-center gap-1 text-meta text-danger", className)}>
      <span className="truncate">{offline ? `Didn't ${verb}: no connection` : `Didn't ${verb}`}</span>
      <span aria-hidden="true">·</span>
      <button
        type="button"
        onClick={onRetry}
        className="relative shrink-0 font-medium underline decoration-1 underline-offset-3 hover:decoration-2 pointer-coarse:after:absolute pointer-coarse:after:-inset-3"
      >
        Retry
      </button>
    </p>
  );
}
