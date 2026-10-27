"use client";
import { Fragment, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowRight } from "lucide-react";
import { ActivityDay, ActivityDivider, ActivityItem, ActivityRun, ActivityTimeline } from "@/components/activity-timeline";
import { ActivityTime } from "@/components/activity-time";
import { CommentBody, CommentCard, CommentEditor, SendFailedLine } from "@/components/comment-card";
import { Composer, PendingSendsProvider, isOfflineMessage, usePendingSends, type PendingSend } from "@/components/composer";
import { MenuItem, MenuSeparator } from "@/components/menu";
import { Money } from "@/components/money";
import { useToast } from "@/components/toast";
import { callAction } from "@/lib/action-result";
import type { Ymd } from "@/lib/dates";
import { LOG_SHOWN, groupLog, type ChangeEntry, type FieldRow, type LineEntry, type LogEntry, type NoteEntry } from "@/lib/deals/record-log";
import { bodySegments } from "@/lib/tasks/body-links";
import { addDealNote, deleteDealNoteAction, editDealNoteAction, restoreDealNoteAction } from "./note-actions";

function subscribeToHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

/**
 * A deal's record log (docs/specs/activity-comments.md 2.9, choice 3.3 A):
 * the note box on top, then the log newest first on the shared timeline.
 * Notes are comment cards with their author on the rail; a change is one
 * quiet sentence with a dot, and several by one person fold into a run that
 * opens into a row per field, old value, an arrow, new value. The newest 15
 * rows show; "Show 40 older updates" at the foot opens the rest.
 *
 * The note box is the shared Composer without a switch or uploads. A note
 * shows at the top at once ("Sending…" after 200ms) and, if it can't be
 * saved, stays there with "Didn't save · Retry", the same message and the
 * same `clientId`, so a Retry that did post never posts twice. It posts
 * through addDealNote, which answers with a result instead of throwing. Your
 * own notes have Edit and Delete in their menu; Delete shows a toast with
 * Undo. A line from the deals sheet names no one (no avatar, no name), and a
 * rule marks where the sheet's lines end and this app's begin.
 */
export function DealLog(props: {
  dealId: string;
  entries: LogEntry[];
  /** Whose notes get Edit and Delete. */
  viewerId: string;
  /** Their name, for a note on its way. */
  viewerName: string;
  /** The page's render time (ISO), so every time label matches the server's. */
  now: string;
  today: Ymd;
}) {
  return (
    <PendingSendsProvider author={props.viewerName}>
      <DealLogBody {...props} />
    </PendingSendsProvider>
  );
}

/** A note typed here, not one from the deals sheet. */
const isImported = (e: LogEntry) => e.type === "note" && e.imported;

function DealLogBody({
  dealId,
  entries,
  viewerId,
  now,
  today,
}: {
  dealId: string;
  entries: LogEntry[];
  viewerId: string;
  now: string;
  today: Ymd;
}) {
  // null until someone presses the toggle: then a link to a folded-away row decides.
  const [opened, setOpened] = useState<boolean | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  // Notes deleted here, hidden at once until the page catches up.
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const all = entries.filter((e) => !hidden.has(e.id));
  const older = Math.max(0, all.length - LOG_SHOWN);
  const log = useRef<HTMLDivElement>(null);

  // Notes sent from the box and not yet in the log. Once the page holds a note's own entry, the one that stood in for it is done.
  const sends = usePendingSends();
  const known = new Set(entries.flatMap((e) => (e.type === "note" && e.clientId ? [e.clientId] : [])));
  const inFlight = (sends?.sends ?? []).filter((s) => !known.has(s.clientId));
  const settle = sends?.remove;
  useEffect(() => {
    for (const s of sends?.sends ?? []) if (known.has(s.clientId) && s.status !== "sending") settle?.(s.clientId);
  });

  // A link to a row that's folded away opens the log, so the anchor has something to land on.
  const hash = useSyncExternalStore(subscribeToHash, () => window.location.hash, () => "");
  const linked = hash.startsWith("#update-") ? hash.slice("#update-".length) : null;
  const linkedAway = linked !== null && !all.slice(0, LOG_SHOWN).some((e) => e.id === linked) && all.some((e) => e.id === linked);
  const open = opened ?? linkedAway;
  useEffect(() => {
    if (!linkedAway) return;
    const frame = requestAnimationFrame(() => document.getElementById(`update-${linked}`)?.scrollIntoView({ block: "center" }));
    return () => cancelAnimationFrame(frame);
  }, [linkedAway, linked]);

  const visible = open ? all : all.slice(0, LOG_SHOWN);
  // Month headings are for the opened log; the newest 15 keep their days (activity 2.3, rule 8).
  const groups = groupLog(visible, today, { months: open });

  // The rule between the sheet's lines and this app's: right after the oldest line typed here, when sheet lines follow it.
  const lastTyped = visible.findLastIndex((e) => !isImported(e));
  const sheetRule = lastTyped >= 0 && visible.slice(lastTyped + 1).some(isImported) ? visible[lastTyped].id : null;
  // A note on its way is today's newest: under the Today heading when the log has one, else under a heading of its own.
  const firstDay = groups[0]?.kind === "day" ? groups[0].day : null;
  const showsToday = inFlight.length > 0 && firstDay === today;
  const sendingNotes = inFlight.map((s) => <InFlightNote key={s.clientId} send={s} author={sends?.author ?? ""} />);

  return (
    <>
      <Composer
        // This surface's own key: a deal note draft never opens on another record or in the portal.
        draftKey={`hgos-deal-note-draft:${dealId}`}
        visibility="none"
        pin="never"
        placeholders={{ shared: "Add a note" }}
        sendLabel={{ shared: "Add note" }}
        sentClientIds={[...known]}
        onSend={({ body, clientId }) => addDealNote(dealId, { body, clientId })}
      />
      {all.length === 0 && inFlight.length === 0 ? (
        <p className="mt-4 text-body text-fg-3">No activity yet.</p>
      ) : (
        // Focus goes here after a delete, so the keyboard keeps its place in the page.
        <div ref={log} tabIndex={-1} className="mt-4 outline-none">
          <ActivityTimeline now={now}>
            {inFlight.length > 0 && !showsToday && <ActivityDay day={today} today={today} />}
            {inFlight.length > 0 && !showsToday && sendingNotes}
            {groups.map((g, gi) => (
              <Fragment key={`${g.kind}:${g.key}`}>
                {g.kind === "undated" ? <ActivityDay>Undated</ActivityDay> : <ActivityDay day={g.day ?? undefined} today={today} month={g.kind === "month"} />}
                {showsToday && gi === 0 && sendingNotes}
                {g.entries.map((e) => (
                  <Fragment key={e.id}>
                    <EntryRow
                      entry={e}
                      month={g.kind === "month"}
                      dealId={dealId}
                      mine={e.type === "note" && e.authorUserId === viewerId}
                      editing={editing === e.id}
                      onEdit={(id) => setEditing(id)}
                      onHide={(id, hide) =>
                        setHidden((h) => {
                          const next = new Set(h);
                          if (hide) next.add(id);
                          else next.delete(id);
                          return next;
                        })
                      }
                      onDeleted={() => log.current?.focus()}
                    />
                    {sheetRule === e.id && <ActivityDivider>Moved from the deals sheet</ActivityDivider>}
                  </Fragment>
                ))}
              </Fragment>
            ))}
            {older > 0 && (
              <ActivityItem marker="none" className="print:hidden">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpened(!open)}
                  className="rounded-sm text-meta font-medium text-fg-1 underline-offset-3 hover:underline pointer-coarse:min-h-11"
                >
                  {open ? "Hide older updates" : `Show ${older} older ${older === 1 ? "update" : "updates"}`}
                </button>
              </ActivityItem>
            )}
          </ActivityTimeline>
        </div>
      )}
    </>
  );
}

/** A note on its way: the new card at the top while it saves, and on a failure the same message with Retry, Edit and Discard. */
function InFlightNote({ send, author }: { send: PendingSend; author: string }) {
  const failed = send.status === "failed";
  return (
    <CommentCard
      id={`pending-${send.clientId}`}
      author={{ name: author }}
      noun="note"
      at={send.at}
      body={send.body || null}
      sending={send.status === "sending"}
      footer={failed ? <SendFailedLine verb="save" offline={isOfflineMessage(send.error)} onRetry={send.retry} /> : undefined}
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

function EntryRow({
  entry,
  month,
  dealId,
  mine,
  editing,
  onEdit,
  onHide,
  onDeleted,
}: {
  entry: LogEntry;
  month: boolean;
  dealId: string;
  mine: boolean;
  editing: boolean;
  onEdit: (id: string | null) => void;
  onHide: (id: string, hide: boolean) => void;
  onDeleted: () => void;
}) {
  if (entry.type === "note") return <NoteRow note={entry} dealId={dealId} mine={mine} editing={editing} onEdit={onEdit} onHide={onHide} onDeleted={onDeleted} />;
  if (entry.type === "change") return <ChangeRow change={entry} month={month} />;
  return <LineRow line={entry} month={month} />;
}

/** A note as a comment card, with Copy link and Copy text for everyone and Edit and Delete for its author. */
function NoteRow({
  note,
  dealId,
  mine,
  editing,
  onEdit,
  onHide,
  onDeleted,
}: {
  note: NoteEntry;
  dealId: string;
  mine: boolean;
  editing: boolean;
  onEdit: (id: string | null) => void;
  onHide: (id: string, hide: boolean) => void;
  onDeleted: () => void;
}) {
  const { toast } = useToast();

  async function copy(text: string, done: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast({ message: done });
    } catch {
      toast({ message: "Couldn't copy. Select the text to copy it instead." });
    }
  }

  async function remove() {
    onHide(note.id, true);
    const res = await callAction(() => deleteDealNoteAction(dealId, note.id));
    if (!res.ok) {
      onHide(note.id, false);
      toast({ message: res.error });
      return;
    }
    // The card is gone and took the focus with it.
    onDeleted();
    toast({
      message: "Note deleted",
      key: `deal-note:${note.id}`,
      action: {
        label: "Undo",
        onAction: () => {
          void callAction(() => restoreDealNoteAction(dealId, note.id)).then((undone) => {
            if (undone.ok) onHide(note.id, false);
            else toast({ message: undone.error });
          });
        },
      },
    });
  }

  return (
    <CommentCard
      id={note.id}
      // A line from the spreadsheet, or one that names nobody, has no author: no avatar and no name, never one made up.
      author={note.author ? { name: note.author } : null}
      noun="note"
      at={note.at ?? ""}
      edited={note.editedAt}
      // Links in the text open (activity 2.2 a); the edit opens in place, with Esc and the mod key and Enter.
      body={<CommentBody segments={bodySegments(note.text)} />}
      editor={
        editing ? <CommentEditor initial={note.text} noun="note" onCancel={() => onEdit(null)} onSave={(text) => editDealNoteAction(dealId, note.id, text)} /> : undefined
      }
      menuItems={
        editing ? undefined : (
          <>
            <MenuItem id="link" onAction={() => copy(`${window.location.origin}/deals/${dealId}#update-${note.id}`, "Link copied")}>
              Copy link
            </MenuItem>
            <MenuItem id="text" onAction={() => copy(note.text, "Text copied")}>
              Copy text
            </MenuItem>
            {mine && (
              <>
                <MenuItem id="edit" onAction={() => onEdit(note.id)}>
                  Edit
                </MenuItem>
                <MenuSeparator />
                <MenuItem id="delete" variant="destructive" onAction={remove}>
                  Delete
                </MenuItem>
              </>
            )}
          </>
        )
      }
    />
  );
}

/** A system line: "Pieter changed the stage to High · 2h", with a dot on the rail. */
function ChangeRow({ change, month }: { change: ChangeEntry; month: boolean }) {
  const time = change.at ? <ActivityTime at={change.at} month={month} /> : null;
  if (change.fields.length === 1) {
    return (
      <ActivityItem id={`update-${change.id}`} marker="dot">
        <p className="text-meta text-fg-3">
          {change.sentence}
          {time && (
            <>
              <span aria-hidden="true">{" · "}</span>
              {time}
            </>
          )}
        </p>
      </ActivityItem>
    );
  }
  return (
    <ActivityRun id={`update-${change.id}`} summary={change.sentence} time={time}>
      {change.fields.map((f) => (
        <ActivityItem key={f.field} marker="dot">
          <FieldLine row={f} />
        </ActivityItem>
      ))}
    </ActivityRun>
  );
}

/**
 * One field of an opened run: its label in the 112px rail column (96 on
 * phones), then the old value, an arrow and the new one, amounts through
 * Money. A long text value wraps inside its column with the arrow kept
 * beside the new value.
 */
function FieldLine({ row }: { row: FieldRow }) {
  return (
    <p className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3 text-meta sm:grid-cols-[7rem_minmax(0,1fr)]">
      <span className="min-w-0 truncate text-fg-3">{row.label}</span>
      <span className="flex min-w-0 flex-wrap items-start gap-x-1.5 break-words text-fg-2">
        <Value text={row.from} amount={row.fromAmount} />
        <span className="inline-flex min-w-0 items-start gap-1.5">
          <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-fg-3" aria-label="to" role="img" />
          <Value text={row.to} amount={row.toAmount} />
        </span>
      </span>
    </p>
  );
}

function Value({ text, amount }: { text: string | null; amount: number | null }) {
  if (text === null) return <span className="text-fg-3">—</span>;
  return amount !== null ? <Money value={amount} /> : <span className="min-w-0 [overflow-wrap:anywhere]">{text}</span>;
}

/** A line that isn't a field edit: "Task added: Replace porch light · Connor · 2h". */
function LineRow({ line, month }: { line: LineEntry; month: boolean }) {
  return (
    <ActivityItem id={`update-${line.id}`} marker="dot">
      <p className="text-meta text-fg-3 [overflow-wrap:anywhere]">
        {line.text}
        {line.by && (
          <>
            <span aria-hidden="true">{" · "}</span>
            {line.by}
          </>
        )}
        {line.at && (
          <>
            <span aria-hidden="true">{" · "}</span>
            <ActivityTime at={line.at} month={month} />
          </>
        )}
      </p>
    </ActivityItem>
  );
}
