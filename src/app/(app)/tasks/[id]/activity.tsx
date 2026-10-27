"use client";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { TaskStatus } from "@prisma/client";
import { ActivityDay, ActivityDivider, ActivityItem, ActivityRun, ActivityTimeline } from "@/components/activity-timeline";
import { ActivityTime } from "@/components/activity-time";
import { CommentBody, CommentCard, CommentEditor, DeliveryLine, SendFailedLine } from "@/components/comment-card";
import { isOfflineMessage, usePendingSends, type PendingSend } from "@/components/composer";
import { FilesList } from "@/components/files-list";
import { MediaGrid } from "@/components/media-grid";
import { MenuItem, MenuSeparator } from "@/components/menu";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import { Button, TextLink } from "@/components/ui";
import { callAction } from "@/lib/action-result";
import { todayYmdEastern, type Ymd } from "@/lib/dates";
import { foldStart, firstNewIndex, groupHeadings } from "@/lib/tasks/activity";
import { cn } from "@/lib/utils";
import { deleteTaskComment, editTaskComment, restoreTaskComment, updateTask } from "./actions";
import type { ActivityRow, CommentFields, LineFields } from "./activity-rows";

export type { ActivityRow } from "./activity-rows";

const SHOWN = 15;

/**
 * Activity, oldest first, on the shared timeline (components/activity-timeline.tsx):
 * comments as cards with the author's avatar on the rail, a status change
 * with its StatusMark, every other change as one muted line with a dot, a
 * burst of changes as one folded line that opens onto them, and a heading per
 * day (a month once it's older than 60 days). The latest 15 show; earlier
 * ones fold behind "Show N earlier updates", which never hides the New
 * divider or the update a link points at.
 *
 * The New divider sits above the first entry someone else wrote since you
 * last opened the task. It is read once, when the page mounts: a refresh (or
 * a reply that lands while you read) leaves it where it was, and replies land
 * under it. A comment you wrote shows at once, "Sending…" in its time slot,
 * and if it can't go it stays with its Retry (PendingSendsProvider).
 *
 * A shared comment is a flat --surface card on a hairline edge; an internal
 * one is a --fill-1 card, and its Lock says so, so it never reads as Review's
 * amber (docs/brand-guidelines.md, section 9).
 */
export function TaskActivity({
  taskId,
  rows,
  now,
  today,
  newSince,
}: {
  taskId: string;
  rows: ActivityRow[];
  /** When the page was rendered (ISO), so every time reads the same on the server and in the browser. */
  now: string;
  today: Ymd;
  /** When the viewer last opened the task before this visit (ISO): the New divider's baseline. */
  newSince: string | null;
}) {
  const [baseline] = useState(newSince);
  const sends = usePendingSends();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ text: string; by: string } | null>(null);
  const [anchor, setAnchor] = useState<string | null>(null);
  // The comment just deleted: its card is gone, and focus goes to the line that took its place.
  const [deletedId, setDeletedId] = useState<string | null>(null);
  // The comment just brought back by Undo: focus goes to its menu button, where the deleted line was.
  const [restoredId, setRestoredId] = useState<string | null>(null);
  const focused = useCallback(() => {
    setDeletedId(null);
    setRestoredId(null);
  }, []);

  // A link to an update (`#update-<id>`, from a job email or Copy link) opens the fold as far as it needs.
  useEffect(() => {
    const read = () => {
      const m = /^#update-(.+)$/.exec(window.location.hash);
      setAnchor(m ? decodeURIComponent(m[1]) : null);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  const firstNew = firstNewIndex(rows, baseline);
  const anchored = anchor ? rows.findIndex((r) => r.ids.includes(anchor)) : -1;
  const folded = foldStart(rows.length, { shown: SHOWN, firstNew, anchored });
  const start = open ? 0 : folded;
  useEffect(() => {
    if (anchor) document.getElementById(`update-${anchor}`)?.scrollIntoView({ block: "start" });
  }, [anchor, folded]);

  const absolute = useMemo(() => new Map(rows.map((r, i) => [r.id, i])), [rows]);
  const visible = rows.slice(start);
  const known = new Set(rows.flatMap((r) => r.clientIds));
  const inFlight = (sends?.sends ?? []).filter((s) => !known.has(s.clientId));
  // Once the page holds a message's own row, the one that stood in for it is done (and stays gone if that row is deleted).
  const settle = sends?.remove;
  useEffect(() => {
    for (const s of sends?.sends ?? []) if (known.has(s.clientId) && s.status !== "sending") settle?.(s.clientId);
  });

  if (rows.length === 0 && inFlight.length === 0) return <p className="text-body text-fg-3">No activity yet.</p>;

  const groups = groupHeadings(visible, (r) => r.day, today);
  const lastDay = groups.length ? groups[groups.length - 1].day : null;

  return (
    <>
      <ActivityTimeline now={now}>
        {/* One toggle, so it keeps focus when it opens and closes. In print the earlier updates stay folded, and say so. */}
        {(start > 0 || (open && folded > 0)) && (
          <ActivityItem marker="none" className="print:hidden">
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen(!open)}
              className="rounded-sm text-meta font-medium text-fg-1 underline-offset-3 hover:underline pointer-coarse:min-h-11"
            >
              {open ? "Hide earlier updates" : `Show ${start} earlier ${start === 1 ? "update" : "updates"}`}
            </button>
          </ActivityItem>
        )}
        {start > 0 && (
          <ActivityItem marker="none" className="hidden print:grid">
            <p className="text-meta text-fg-3">
              {start} earlier {start === 1 ? "update" : "updates"} not shown
            </p>
          </ActivityItem>
        )}
        {groups.map((g) => (
          <Fragment key={`${g.month ? "m" : "d"}:${g.day}:${g.entries[0].id}`}>
            <ActivityDay day={g.day} today={today} month={g.month} />
            {g.entries.map((r) => (
              <Fragment key={r.id}>
                {absolute.get(r.id) === firstNew && <ActivityDivider unread>New</ActivityDivider>}
                <Row
                  row={r}
                  month={g.month}
                  taskId={taskId}
                  editing={editing}
                  setEditing={setEditing}
                  openRun={anchor !== null && r.ids.includes(anchor)}
                  onViewPrevious={(text, by) => setViewing({ text, by })}
                  deletedId={deletedId}
                  onDeleted={setDeletedId}
                  restoredId={restoredId}
                  onRestored={setRestoredId}
                  onFocused={focused}
                />
              </Fragment>
            ))}
          </Fragment>
        ))}
        {inFlight.length > 0 && lastDay !== todayYmdEastern(new Date(inFlight[0].at)) && <ActivityDay day={todayYmdEastern(new Date(inFlight[0].at))} today={today} />}
        {inFlight.map((s) => (
          <InFlight key={s.clientId} send={s} author={sends?.author ?? ""} />
        ))}
      </ActivityTimeline>
      <PreviousNotes taskId={taskId} viewing={viewing} onClose={() => setViewing(null)} />
    </>
  );
}

/* ---------------- Rows ---------------- */

function Row({
  row,
  month,
  taskId,
  editing,
  setEditing,
  openRun,
  onViewPrevious,
  deletedId,
  onDeleted,
  restoredId,
  onRestored,
  onFocused,
}: {
  row: ActivityRow;
  month: boolean;
  taskId: string;
  editing: string | null;
  setEditing: (id: string | null) => void;
  openRun: boolean;
  onViewPrevious: (text: string, by: string) => void;
  deletedId: string | null;
  onDeleted: (id: string) => void;
  restoredId: string | null;
  onRestored: (id: string) => void;
  onFocused: () => void;
}) {
  switch (row.type) {
    case "comment":
      return (
        <CommentRowView
          row={row.comment}
          at={row.at}
          delivery={row.delivery}
          month={month}
          taskId={taskId}
          editing={editing === row.comment.id}
          setEditing={setEditing}
          onDeleted={onDeleted}
          focus={restoredId === row.comment.id}
          onRestored={onRestored}
          onFocused={onFocused}
        />
      );
    case "deleted":
      return <DeletedLine row={row} month={month} focus={deletedId === row.id} onFocused={onFocused} />;
    case "moved":
      return <ActivityDivider>{row.label}</ActivityDivider>;
    case "decision":
      return <DecisionRowView row={row} month={month} />;
    case "batch":
      return (
        <ActivityItem id={`update-${row.id}`} marker="dot">
          <LineText line={row} at={row.at} month={month} onViewPrevious={onViewPrevious} />
          <Attachments line={row} />
          {row.delivery && <DeliveryLine className="mt-1" state={row.delivery.state} to={row.delivery.to} at={row.delivery.at} />}
        </ActivityItem>
      );
    case "run":
      return (
        <ActivityRun
          key={openRun ? "open" : "closed"}
          id={`update-${row.id}`}
          marker={row.status ? { status: row.status } : "dot"}
          summary={row.text}
          time={<ActivityTime at={row.at} month={month} />}
          defaultOpen={openRun}
          after={row.previous !== null ? <ViewPrevious onPress={() => onViewPrevious(row.previous ?? "", row.by)} /> : undefined}
        >
          {row.members.map((m) => (
            <ActivityItem key={m.id} id={`update-${m.id}`} marker={m.status ? { status: m.status } : "dot"}>
              <LineText line={m} at={m.at} month={month} onViewPrevious={onViewPrevious} />
              <Attachments line={m} />
            </ActivityItem>
          ))}
        </ActivityRun>
      );
    case "line":
      return (
        <ActivityItem id={`update-${row.id}`} marker={row.status ? { status: row.status } : "dot"}>
          <LineText line={row} at={row.at} month={month} onViewPrevious={onViewPrevious} />
          <Attachments line={row} />
          {row.delivery && <DeliveryLine className="mt-1" state={row.delivery.state} to={row.delivery.to} at={row.delivery.at} />}
        </ActivityItem>
      );
  }
}

/** One system sentence, its time, "via Asana" for a live sync event, and "View previous" on a notes change. */
function LineText({
  line,
  at,
  month,
  onViewPrevious,
}: {
  line: LineFields;
  at: string;
  month: boolean;
  onViewPrevious: (text: string, by: string) => void;
}) {
  return (
    <p className="text-meta text-fg-3">
      {line.href ? <TextLink href={line.href}>{line.text}</TextLink> : line.text}
      <span aria-hidden="true">{" · "}</span>
      <ActivityTime at={at} month={month} />
      {line.viaAsana && <span>{" · via Asana"}</span>}
      {line.previous !== null && line.status === null && (
        <>
          <span aria-hidden="true">{" · "}</span>
          <ViewPrevious onPress={() => onViewPrevious(line.previous ?? "", line.by)} />
        </>
      )}
    </p>
  );
}

function ViewPrevious({ onPress }: { onPress: () => void }) {
  return (
    <button
      type="button"
      onClick={onPress}
      className="relative text-meta text-fg-2 underline decoration-1 underline-offset-3 hover:text-fg-1 hover:decoration-2 pointer-coarse:after:absolute pointer-coarse:after:-inset-3"
    >
      View previous
    </button>
  );
}

function Attachments({ line }: { line: LineFields }) {
  return (
    <>
      {line.media.length > 0 && <MediaGrid items={line.media} variant="strip" inCard className="mt-1.5" />}
      <FilesList files={line.files} className="mt-1.5" />
    </>
  );
}

/* ---------------- A status change and its note ---------------- */

function DecisionRowView({ row, month }: { row: Extract<ActivityRow, { type: "decision" }>; month: boolean }) {
  const note = row.note;
  return (
    <ActivityItem id={`update-${row.id}`} marker={row.status ? { status: row.status as TaskStatus } : "dot"}>
      <p className="text-meta text-fg-3">
        {row.text}
        <span aria-hidden="true">{" · "}</span>
        <ActivityTime at={row.at} month={month} />
      </p>
      {note && (
        // No header of its own: the line above names who and when. Styled by the note's own visibility, and
        // anchored so an email that opens at the note finds it.
        <div
          id={`update-${note.id}`}
          className={cn(
            "mt-1.5 scroll-mt-[calc(var(--app-bar-h)+1rem)] rounded-md border px-3 py-2.5",
            note.internal ? "border-transparent bg-fill-1" : "border-line bg-surface",
          )}
        >
          {note.segments && (
            <p className="whitespace-pre-wrap break-words text-body text-fg-1">
              <CommentBody segments={note.segments} />
            </p>
          )}
          {note.media.length > 0 && <MediaGrid items={note.media} variant="strip" inCard className={cn(note.segments && "mt-2")} />}
          {note.files.length > 0 && <FilesList files={note.files} onFill={note.internal} className="mt-2" />}
        </div>
      )}
      {row.delivery && <DeliveryLine className="mt-1" state={row.delivery.state} to={row.delivery.to} at={row.delivery.at} />}
    </ActivityItem>
  );
}

/** "Connor deleted a comment · now": a staff-only trace, timed from the delete. Takes focus when it is the card that was just deleted. */
function DeletedLine({ row, month, focus, onFocused }: { row: Extract<ActivityRow, { type: "deleted" }>; month: boolean; focus: boolean; onFocused: () => void }) {
  const line = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (!focus) return;
    line.current?.focus();
    onFocused();
  }, [focus, onFocused]);
  return (
    <ActivityItem id={`update-${row.id}`} marker="dot">
      <p ref={line} tabIndex={-1} className="text-meta text-fg-3 outline-none">
        {row.author} deleted a comment
        <span aria-hidden="true">{" · "}</span>
        <ActivityTime at={row.deletedAt} month={month} />
      </p>
    </ActivityItem>
  );
}

/* ---------------- A comment ---------------- */

function CommentRowView({
  row: c,
  at,
  delivery,
  month,
  taskId,
  editing,
  setEditing,
  onDeleted,
  focus,
  onRestored,
  onFocused,
}: {
  row: CommentFields;
  at: string;
  delivery: ActivityRow["delivery"];
  month: boolean;
  taskId: string;
  editing: boolean;
  setEditing: (id: string | null) => void;
  onDeleted: (id: string) => void;
  /** This card is the one Undo just brought back: its menu button takes focus as it appears. */
  focus: boolean;
  onRestored: (id: string) => void;
  onFocused: () => void;
}) {
  const { toast } = useToast();
  // The card has taken focus (CommentCard's focusOnMount runs first); the page lets go of the request.
  useEffect(() => {
    if (focus) onFocused();
  }, [focus, onFocused]);

  async function copy(text: string, done: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast({ message: done });
    } catch {
      toast({ message: "Couldn't copy that." });
    }
  }

  async function remove() {
    const res = await callAction(() => deleteTaskComment(c.id));
    if (!res.ok) return toast({ message: res.error });
    onDeleted(c.id);
    toast({
      message: "Comment deleted",
      detail: res.data.emailNote ?? undefined,
      action: {
        label: "Undo",
        onAction: () =>
          void callAction(() => restoreTaskComment(c.id)).then((r) => {
            if (!r.ok) return toast({ message: r.error });
            onRestored(c.id);
          }),
      },
    });
  }

  // A comment that's only files, now all gone, is a line.
  const gone = !c.segments && c.media.length === 0 && c.files.length === 0 && c.removedFiles > 0;
  if (gone) {
    return (
      <ActivityItem id={`update-${c.id}`} marker="dot">
        <p className="text-meta text-fg-3">
          {c.author.split(" ")[0]} posted files that were later removed
          <span aria-hidden="true">{" · "}</span>
          <ActivityTime at={at} month={month} />
        </p>
      </ActivityItem>
    );
  }

  const editNote = c.email === "emailed" && c.to ? `${c.to} already got the first version` : c.email === "queued" && c.to ? `${c.to} gets the edited version` : null;

  return (
    <CommentCard
      id={c.id}
      author={{ name: c.author, contractor: c.isContractor }}
      at={at}
      month={month}
      edited={c.edited}
      internal={c.internal}
      onItem={c.onItem}
      body={c.segments ? <CommentBody segments={c.segments} /> : null}
      editor={
        editing ? (
          <CommentEditor
            initial={c.text ?? ""}
            note={editNote}
            hasFiles={c.media.length + c.files.length > 0}
            onSave={(body) => editTaskComment(c.id, body)}
            onCancel={() => setEditing(null)}
          />
        ) : undefined
      }
      media={c.media.length > 0 ? <MediaGrid items={c.media} variant="strip" inCard /> : null}
      files={c.files.length > 0 ? <FilesList files={c.files} onFill={c.internal} /> : null}
      removedFiles={c.removedFiles}
      focusOnMount={focus}
      footer={delivery ? <DeliveryLine state={delivery.state} to={delivery.to} at={delivery.at} /> : undefined}
      menuItems={
        <>
          <MenuItem id="link" onAction={() => void copy(`${window.location.origin}/tasks/${taskId}#update-${c.id}`, "Link copied")}>
            Copy link
          </MenuItem>
          {c.text && (
            <MenuItem id="text" onAction={() => void copy(c.text ?? "", "Text copied")}>
              Copy text
            </MenuItem>
          )}
          {c.mine && (
            <MenuItem id="edit" onAction={() => setEditing(c.id)}>
              Edit
            </MenuItem>
          )}
          {c.mine && <MenuSeparator />}
          {c.mine && (
            <MenuItem id="delete" variant="destructive" onAction={() => void remove()}>
              Delete
            </MenuItem>
          )}
        </>
      }
    />
  );
}

/* ---------------- A message on its way ---------------- */

function InFlight({ send, author }: { send: PendingSend; author: string }) {
  const failed = send.status === "failed";
  const text = send.body;
  return (
    <CommentCard
      id={`pending-${send.clientId}`}
      author={{ name: author }}
      at={send.at}
      internal={send.visibility === "INTERNAL"}
      body={text || null}
      files={send.files.length > 0 ? <p className="truncate text-meta text-fg-3">{send.files.map((f) => f.filename).join(", ")}</p> : null}
      sending={send.status === "sending"}
      footer={failed ? <SendFailedLine offline={isOfflineMessage(send.error)} onRetry={send.retry} /> : undefined}
      menuItems={
        failed ? (
          <>
            <MenuItem id="retry" onAction={send.retry}>
              Retry
            </MenuItem>
            <MenuItem id="edit" onAction={send.edit}>
              Edit
            </MenuItem>
            <MenuSeparator />
            <MenuItem id="discard" variant="destructive" onAction={send.discard}>
              Discard
            </MenuItem>
          </>
        ) : undefined
      }
    />
  );
}

/* ---------------- View previous ---------------- */

/** The notes as they were before an edit, with a way back to them (activity 2.3 rule 6). */
function PreviousNotes({ taskId, viewing, onClose }: { taskId: string; viewing: { text: string; by: string } | null; onClose: () => void }) {
  const { toast } = useToast();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  // The sheet closes with its content, so keep the last text for the exit.
  const [last, setLast] = useState(viewing);
  if (viewing && viewing !== last) setLast(viewing);
  const shown = viewing ?? last;

  async function restore() {
    if (!viewing) return;
    setSaving(true);
    const res = await callAction(() => updateTask(taskId, { description: viewing.text || null }));
    setSaving(false);
    if (!res.ok) return toast({ message: res.error });
    toast({ message: "Notes restored" });
    onClose();
    router.refresh();
  }

  return (
    <Sheet
      title={`Notes before ${shown?.by ?? "the"}'s edit`}
      isOpen={!!viewing}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      footer={
        <div className="flex justify-end">
          <Button variant="secondary" pending={saving} onClick={() => void restore()}>
            Restore this version
          </Button>
        </div>
      }
    >
      <div className="p-4">
        {shown?.text ? (
          <p className="whitespace-pre-wrap break-words text-body text-fg-1">{shown.text}</p>
        ) : (
          <p className="text-body text-fg-3">The notes were empty.</p>
        )}
      </div>
    </Sheet>
  );
}
