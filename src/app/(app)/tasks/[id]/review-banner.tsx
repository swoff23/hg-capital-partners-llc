"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { TaskStatus } from "@prisma/client";
import { ActivityTime } from "@/components/activity-time";
import { Avatar } from "@/components/avatar";
import { MediaGrid, type MediaItem } from "@/components/media-grid";
import { StatusMark } from "@/components/status-badge";
import { Button, Card } from "@/components/ui";
import { SendBackSheet } from "../send-back-sheet";
import { approveTask, undoApprove } from "../list-actions";
import { setTaskStatus } from "./actions";
import { useStatusRun } from "./status-run";

/** What a Review banner shows (docs/specs/activity-comments.md 3.6 B): the proof, in one place. */
export interface ReviewProof {
  /** First name, for the sentence. */
  name: string;
  /** For the avatar's initials. */
  fullName: string;
  isContractor: boolean;
  /** When they marked it done (ISO). */
  markedAt: string;
  /** The words they wrote with Mark done, if any. */
  note: string | null;
  /** This visit's photos by that contractor, the Mark done set first (lib/tasks/media.ts reviewPhotos). */
  photos: MediaItem[];
  /** Checklist items done and in all, when the task has a checklist. */
  checklist: { done: number; total: number } | null;
}

/** Who decided last and how, while nothing has moved since: the banner's one-line outcome. */
export interface ReviewDecision {
  status: Extract<TaskStatus, "DONE" | "IN_PROGRESS">;
  /** First name. */
  name: string;
  /** When (ISO). */
  at: string;
}

/**
 * Where the Review banner sits. While the job waits on staff it is the
 * banner. Once it is decided, the banner shrinks in place to one system line
 * for the rest of the visit, led by the new status's mark: "Pieter approved
 * this · 9:14 AM", "Connor sent this back · now" (activity 2.8). Arriving on
 * a job already decided shows nothing: the decision pair in Activity keeps
 * the record, so the line is only for the visit that held the banner. A
 * stale banner (Pieter approved first) refreshes into the same line.
 */
export function ReviewSlot({
  taskId,
  review,
  decision,
  contractor,
  hasLogin,
  now,
}: {
  taskId: string;
  review: ReviewProof | null;
  decision: ReviewDecision | null;
  /** The contractor's first name when one is assigned: who Send back goes to, and who hears of Approve. */
  contractor: string | null;
  /** The contractor can sign in, so Approve and Send back reach them by email. */
  hasLogin: boolean;
  /** When the page was rendered (ISO), so the banner's time reads the same on the server and in the browser. */
  now: string;
}) {
  const [heldBanner, setHeldBanner] = useState(!!review);
  if (review && !heldBanner) setHeldBanner(true);
  // The banner (and the button just pressed) is gone: the outcome line takes the keyboard's place, unless focus went somewhere else.
  const outcome = useRef<HTMLParagraphElement>(null);
  const showsOutcome = !review && heldBanner && !!decision;
  useEffect(() => {
    const active = document.activeElement;
    if (showsOutcome && (!active || active === document.body)) outcome.current?.focus();
  }, [showsOutcome]);
  if (review) return <ReviewBanner taskId={taskId} contractor={contractor} hasLogin={hasLogin} now={now} {...review} />;
  if (!heldBanner || !decision) return null;
  return (
    <p ref={outcome} tabIndex={-1} role="status" className="flex min-w-0 items-center gap-2 text-meta text-fg-3 outline-none">
      <StatusMark status={decision.status} />
      <span className="min-w-0 truncate">
        {decision.name} {decision.status === "DONE" ? "approved this" : "sent this back"}
        <span aria-hidden="true">{" · "}</span>
        <ActivityTime at={decision.at} now={now} />
      </span>
    </p>
  );
}

/**
 * A job waiting on staff (D6b): a proof card. "Zack marked this done · 2h",
 * the note he wrote (three lines, then More), this visit's photos in one row,
 * the checklist count, and the decision: Send back, then Approve at the
 * trailing edge, Approve the one primary. A flat card, no shadow. On a phone
 * the buttons split the width. Approve toasts with an Undo that puts the job
 * back in Review; Send back opens the one Send back sheet.
 */
function ReviewBanner({
  taskId,
  name,
  fullName,
  isContractor,
  markedAt,
  note,
  photos,
  checklist,
  contractor,
  hasLogin,
  now,
}: ReviewProof & { taskId: string; contractor: string | null; hasLogin: boolean; now: string }) {
  const { run, pending, toast } = useStatusRun();
  const [sendingBack, setSendingBack] = useState(false);
  // A note that didn't go through (or a sheet closed on it): the sheet starts with it next time.
  const [draft, setDraft] = useState("");

  function approve() {
    run(() => approveTask(taskId), {
      // Already Done (the other partner got there first): the page refreshes into the outcome line, with nothing to undo.
      succeeded: ({ approvedEventId, emailsContractor }) => {
        if (!approvedEventId) return;
        toast({
          message: "Approved",
          ...(emailsContractor && contractor ? { detail: `${contractor} gets an email` } : {}),
          action: { label: "Undo", onAction: () => run(() => undoApprove(taskId, approvedEventId)) },
        });
      },
    });
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="flex min-w-0 items-center gap-2.5">
        <Avatar name={fullName} size={24} outline={isContractor} />
        {/* One line at every width: a long name truncates first, never the verb. */}
        <p className="flex min-w-0 text-body text-fg-1">
          <span className="min-w-0 truncate font-medium">{name}</span>
          <span className="shrink-0 whitespace-pre"> marked this done</span>
          <span className="shrink-0 whitespace-pre text-fg-3">
            <span aria-hidden="true">{" · "}</span>
            <ActivityTime at={markedAt} now={now} />
          </span>
        </p>
      </div>
      {note && <Note text={note} />}
      {photos.length > 0 && <MediaGrid items={photos} rows={1} />}
      {checklist && (
        <p className="text-meta text-fg-3">
          Checklist {checklist.done} of {checklist.total} done
        </p>
      )}
      <div className="flex gap-2 max-sm:[&>*]:flex-1 sm:justify-end">
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => setSendingBack(true)}>
          Send back
        </Button>
        <Button size="sm" disabled={pending} onClick={approve}>
          Approve
        </Button>
      </div>
      <SendBackSheet
        isOpen={sendingBack}
        onOpenChange={setSendingBack}
        name={contractor}
        hasLogin={hasLogin}
        value={draft}
        onChange={setDraft}
        onSend={(text) => {
          setSendingBack(false);
          run(() => setTaskStatus(taskId, "IN_PROGRESS", { note: text, expected: "REVIEW" }), {
            succeeded: () => setDraft(""),
            done: contractor ? `Sent back to ${contractor}` : "Sent back",
            // Kept in the sheet for the next try.
            failed: () => setDraft(text),
          });
        }}
      />
    </Card>
  );
}

/** What the contractor wrote with Mark done: three lines, then More when there is more. */
function Note({ text }: { text: string }) {
  const [more, setMore] = useState(false);
  const [clipped, setClipped] = useState(false);
  const el = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    const p = el.current;
    if (p && !more) setClipped(p.scrollHeight > p.clientHeight + 1);
  }, [text, more]);
  return (
    <div>
      <p ref={el} className={`whitespace-pre-wrap break-words text-body text-fg-1 ${more ? "" : "line-clamp-3"}`}>
        {text}
      </p>
      {(clipped || more) && (
        <button
          type="button"
          onClick={() => setMore((m) => !m)}
          className="mt-0.5 text-meta font-medium text-fg-2 underline decoration-1 underline-offset-3 hover:text-fg-1 pointer-coarse:min-h-11 pointer-coarse:min-w-11"
        >
          {more ? "Less" : "More"}
        </button>
      )}
    </div>
  );
}
