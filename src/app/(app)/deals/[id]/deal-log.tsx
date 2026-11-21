"use client";
import { Fragment, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { ActivityDivider, ActivityFold, ActivityItem, ActivityRun, ActivityTimeline } from "@/components/activity-timeline";
import { ActivityTime } from "@/components/activity-time";
import { CommentBody, CommentCard, CommentEditor, SendFailedLine } from "@/components/comment-card";
import { Composer, PendingSendsProvider, isOfflineMessage, usePendingSends, type PendingSend } from "@/components/composer";
import { MenuItem, MenuSeparator } from "@/components/menu";
import { Money } from "@/components/money";
import { useToast } from "@/components/toast";
import { callAction } from "@/lib/action-result";
import { personalDraftKey, sendRefusal } from "@/lib/composer-draft";
import { NOTE_MAX } from "@/lib/deals/field-rules";
import { LOG_SHOWN, type ChangeEntry, type FieldRow, type LineEntry, type LogEntry, type NoteEntry } from "@/lib/deals/record-log";
import { collapseStretches, stretchSummary, type Stretched } from "@/lib/tasks/activity";
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
 * opens into a row per field, old value, an arrow, new value. No day
 * headings: each time slot carries its day. Between two notes, a stretch of
 * 4 or more changes keeps its newest 2 on top and collapses the rest under
 * them into "Show 3 updates: asking price and tasks"; a stage change,
 * archive and restore, and the link to a property never collapse
 * (docs/specs/activity-collapse.md). The newest 15 rows after that show;
 * "Show 40 older updates" at the foot opens the rest.
 *
 * The note box is the shared Composer without a switch or uploads. A note
 * shows at the top at once ("Sending…" after 200ms) and, if it can't be
 * saved, stays there with "Didn't save · Retry", the same message and the
 * same `clientId`, so a Retry that did post never posts twice. A note the
 * service won't take as written, which no Retry can change, says why in
 * Retry's place ("Didn't save · Shorten it to 5,000 characters.",
 * `sendRefusal`), and the card's Edit is the way on. It posts
 * through addDealNote, which answers with a result instead of throwing. Your
 * own notes, and the lines from the deals sheet, have Edit and Delete in
 * their menu and nothing else (no Copy link or Copy text, Connor Nov 15);
 * Delete shows a toast with Undo. A line from the deals sheet names no one
 * (no avatar, no name, no header in its menu), and a rule marks where the
 * sheet's lines end and this app's begin.
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
}: {
  dealId: string;
  entries: LogEntry[];
  viewerId: string;
  now: string;
}) {
  // null until someone presses the toggle: then a link to a folded-away row decides.
  const [opened, setOpened] = useState<boolean | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  // Notes deleted here, hidden at once until the page catches up.
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const all = entries.filter((e) => !hidden.has(e.id));
  const items = collapseStretches(all, { isAnchor: (e) => e.anchor, idOf: (e) => e.id, newestFirst: true });
  const rowsOf = (x: Stretched<LogEntry>) => (x.type === "row" ? [x.row] : x.rows);
  const older = Math.max(0, items.length - LOG_SHOWN);
  const log = useRef<HTMLDivElement>(null);

  // Notes sent from the box and not yet in the log. Once the page holds a note's own entry, the one that stood in for it is done.
  const sends = usePendingSends();
  const known = new Set(entries.flatMap((e) => (e.type === "note" && e.clientId ? [e.clientId] : [])));
  const inFlight = (sends?.sends ?? []).filter((s) => !known.has(s.clientId));
  const settle = sends?.remove;
  useEffect(() => {
    for (const s of sends?.sends ?? []) if (known.has(s.clientId) && s.status !== "sending") settle?.(s.clientId);
  });

  // A link to a row that's folded away opens the log, and one inside a collapsed stretch opens that, so the anchor has
  // something to land on.
  const hash = useSyncExternalStore(subscribeToHash, () => window.location.hash, () => "");
  const linked = hash.startsWith("#update-") ? hash.slice("#update-".length) : null;
  const linkedItem = linked === null ? -1 : items.findIndex((x) => rowsOf(x).some((e) => e.id === linked));
  const linkedAway = linkedItem >= LOG_SHOWN;
  const linkedInside = linkedItem >= 0 && items[linkedItem].type === "collapsed";
  const open = opened ?? linkedAway;
  useEffect(() => {
    if (!linkedAway && !linkedInside) return;
    const frame = requestAnimationFrame(() => document.getElementById(`update-${linked}`)?.scrollIntoView({ block: "center" }));
    return () => cancelAnimationFrame(frame);
  }, [linkedAway, linkedInside, linked]);

  const visible = open ? items : items.slice(0, LOG_SHOWN);

  // The rule between the sheet's lines and this app's: right after the oldest entry typed here, when sheet lines follow it.
  const flat = visible.flatMap(rowsOf);
  const lastTyped = flat.findLastIndex((e) => !isImported(e));
  const ruleAfter = lastTyped >= 0 && flat.slice(lastTyped + 1).some(isImported) ? flat[lastTyped].id : null;
  const sendingNotes = inFlight.map((s) => <InFlightNote key={s.clientId} send={s} author={sends?.author ?? ""} />);
  const entryRow = (e: LogEntry, inStretch = false) => (
    <EntryRow
      key={e.id}
      entry={e}
      flat={inStretch}
      dealId={dealId}
      // Your own notes, and the lines imported from the sheet, which are nobody's.
      mine={e.type === "note" && (e.authorUserId === viewerId || e.imported)}
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
  );

  return (
    <>
      <Composer
        // This surface's own key, per deal and per partner: a note draft never opens on another record, in the
        // portal, or for the other partner on a shared computer.
        draftKey={personalDraftKey("deal-note", dealId, viewerId)}
        visibility="none"
        pin="never"
        placeholders={{ shared: "Add a note" }}
        sendLabel={{ shared: "Add note" }}
        sentClientIds={[...known]}
        onSend={({ body, clientId }) => addDealNote(dealId, { body, clientId })}
      />
      {all.length === 0 && inFlight.length === 0 ? (
        <p className="mt-4 text-body text-muted-foreground">No activity yet.</p>
      ) : (
        // Focus goes here after a delete, so the keyboard keeps its place in the page.
        <div ref={log} tabIndex={-1} className="mt-4 outline-none">
          <ActivityTimeline now={now}>
            {sendingNotes}
            {visible.map((x, i) => (
              <Fragment key={x.type === "row" ? x.row.id : x.id}>
                {x.type === "row" ? (
                  entryRow(x.row)
                ) : (
                  <CollapsedChanges rows={x.rows} forceOpen={i === linkedItem} render={(e) => entryRow(e, true)} />
                )}
                {ruleAfter !== null && rowsOf(x).some((e) => e.id === ruleAfter) && <ActivityDivider>Moved from the deals sheet</ActivityDivider>}
              </Fragment>
            ))}
            {older > 0 && (
              <ActivityItem marker="none" className="print:hidden">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpened(!open)}
                  className="rounded-sm text-meta font-medium text-foreground underline-offset-3 hover:underline pointer-coarse:min-h-11"
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

/** A note on its way: the new card at the top while it saves, and on a failure the same message with Retry (unless it was refused as written), Edit and Discard. */
function InFlightNote({ send, author }: { send: PendingSend; author: string }) {
  const failed = send.status === "failed";
  // A refusal a second try can't change (too long, the deal is gone) says why and offers no Retry; Edit is the way on.
  const refusal = failed ? sendRefusal(send.error) : null;
  return (
    <CommentCard
      id={`pending-${send.clientId}`}
      author={{ name: author }}
      noun="note"
      at={send.at}
      body={send.body || null}
      sending={send.status === "sending"}
      footer={failed ? <SendFailedLine verb="save" offline={isOfflineMessage(send.error)} reason={refusal} onRetry={send.retry} /> : undefined}
      menuItems={
        failed ? (
          <>
            {!refusal && (
              <MenuItem id="retry" onAction={send.retry}>
                Retry
              </MenuItem>
            )}
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
  flat,
  dealId,
  mine,
  editing,
  onEdit,
  onHide,
  onDeleted,
}: {
  entry: LogEntry;
  /** Inside an opened stretch: a change shows its field rows under its sentence, with no toggle of its own. */
  flat: boolean;
  dealId: string;
  mine: boolean;
  editing: boolean;
  onEdit: (id: string | null) => void;
  onHide: (id: string, hide: boolean) => void;
  onDeleted: () => void;
}) {
  if (entry.type === "note") return <NoteRow note={entry} dealId={dealId} mine={mine} editing={editing} onEdit={onEdit} onHide={onHide} onDeleted={onDeleted} />;
  if (entry.type === "change") return <ChangeRow change={entry} flat={flat} />;
  return <LineRow line={entry} />;
}

/** A note as a comment card, with Edit and Delete in its menu for its author (and for anyone on an imported line); others' notes have no menu. */
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
      day={note.at ? null : note.day}
      edited={note.editedAt}
      // Links in the text open (activity 2.2 a); the edit opens in place, with Esc and the mod key and Enter.
      body={<CommentBody segments={bodySegments(note.text)} />}
      editor={
        editing ? (
          // The editor stops at the length the service takes (notes.ts checkBody), where it used to allow 20,000 and the save then refused.
          <CommentEditor initial={note.text} noun="note" maxLength={NOTE_MAX} onCancel={() => onEdit(null)} onSave={(text) => editDealNoteAction(dealId, note.id, text)} />
        ) : undefined
      }
      menuItems={
        editing || !mine ? undefined : (
          <>
            <MenuItem id="edit" onAction={() => onEdit(note.id)}>
              Edit
            </MenuItem>
            <MenuSeparator />
            <MenuItem id="delete" variant="destructive" onAction={remove}>
              Delete
            </MenuItem>
          </>
        )
      }
    />
  );
}

/**
 * The older part of a stretch of changes as one line (activity-collapse 3.3), Linear's way: "Show 3 updates: asking
 * price and tasks…" (the kinds drop below 640px); open, its rows under it, newest first.
 */
function CollapsedChanges({ rows, forceOpen, render }: { rows: LogEntry[]; forceOpen: boolean; render: (entry: LogEntry) => ReactNode }) {
  const words = stretchSummary(rows.length, rows.flatMap((e) => e.kinds));
  return (
    <ActivityFold
      key={forceOpen ? "open" : "closed"}
      defaultOpen={forceOpen}
      summary={
        <>
          {words.show}
          {words.kinds && <span className="max-sm:hidden">: {words.kinds}</span>}
        </>
      }
      openSummary={words.hide}
    >
      {rows.map(render)}
    </ActivityFold>
  );
}

/** A system line: "Pieter changed the stage to High · 2h", with a dot on the rail. */
function ChangeRow({ change, flat }: { change: ChangeEntry; flat: boolean }) {
  const time = change.at || change.day ? <ActivityTime at={change.at} day={change.day} /> : null;
  if (change.fields.length === 1 || flat) {
    return (
      <>
        <ActivityItem id={`update-${change.id}`} marker="dot">
          <p className="text-meta text-muted-foreground">
            {change.sentence}
            {time && (
              <>
                <span aria-hidden="true">{" · "}</span>
                {time}
              </>
            )}
          </p>
        </ActivityItem>
        {change.fields.length > 1 &&
          change.fields.map((f) => (
            <ActivityItem key={f.field} marker="dot">
              <FieldLine row={f} />
            </ActivityItem>
          ))}
      </>
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
      <span className="min-w-0 truncate text-muted-foreground">{row.label}</span>
      <span className="flex min-w-0 flex-wrap items-start gap-x-1.5 break-words text-fg-2">
        <Value text={row.from} amount={row.fromAmount} />
        <span className="inline-flex min-w-0 items-start gap-1.5">
          <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-label="to" role="img" />
          <Value text={row.to} amount={row.toAmount} />
        </span>
      </span>
    </p>
  );
}

function Value({ text, amount }: { text: string | null; amount: number | null }) {
  if (text === null) return <span className="text-muted-foreground">—</span>;
  return amount !== null ? <Money value={amount} /> : <span className="min-w-0 [overflow-wrap:anywhere]">{text}</span>;
}

/** A line that isn't a field edit: "Task added: Replace porch light · Connor · 2h". */
function LineRow({ line }: { line: LineEntry }) {
  return (
    <ActivityItem id={`update-${line.id}`} marker="dot">
      <p className="text-meta text-muted-foreground [overflow-wrap:anywhere]">
        {line.text}
        {line.by && (
          <>
            <span aria-hidden="true">{" · "}</span>
            {line.by}
          </>
        )}
        {(line.at || line.day) && (
          <>
            <span aria-hidden="true">{" · "}</span>
            <ActivityTime at={line.at} day={line.day} />
          </>
        )}
      </p>
    </ActivityItem>
  );
}
