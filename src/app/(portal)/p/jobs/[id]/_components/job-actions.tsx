"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, ImagePlus } from "lucide-react";
import type { TaskStatus } from "@prisma/client";
import { useHoldLeave, useLeaveGuard } from "@/components/leave-guard";
import {
  MediaUploadTray,
  isGoingUp,
  useLeaveWarning,
  useMediaUploader,
  type MediaUploaderApi,
} from "@/components/media-uploader";
import { Sheet } from "@/components/sheet";
import { SpotArt } from "@/components/spot-art";
import { useToast, useToastInset } from "@/components/toast";
import { Button, LinkButton, Textarea } from "@/components/ui";
import { callAction } from "@/lib/action-result";
import { finishingLabel, joinNames, markDoneButton, nextStep, stillUploading } from "@/lib/portal/job-view";
import { cn } from "@/lib/utils";
import { markJobDoneAction, postJobUpdateAction, recordJobUploadAction, startJobAction } from "../actions";

/** Height of the sticky bar above the safe area: 48px buttons plus 12px padding each side. */
const BAR_PX = 72;
/** What the failed-upload line adds under the bar's buttons: an 8px gap and a 20px line. */
const FAILED_LINE_PX = 28;

/**
 * The job page's writing half (§6, Job page): the update composer at the
 * end of the scroll, the sticky bottom bar (Add photo/video and the next
 * step), and the Mark done sheet with its payoff. One uploader serves all
 * three, so Mark done can wait for photos still going up.
 *
 * Photos picked from the bar post as their own update once they're all up,
 * unless there's text in the composer: then they wait and go with it. While
 * the Mark done sheet is open they go with the Mark done instead.
 *
 * A held photo is already on the job, but HG only hears about it (the
 * timeline line and the email) once it's posted. Leaving the page for
 * another one in the app posts whatever is still held. A reload or a closed
 * tab asks first where the browser allows it (iOS Safari never does).
 *
 * Leaving cancels whatever is still going up, so while anything is, "My
 * jobs" and the payoff's "Back to my jobs" ask first in a sheet (the page's
 * LeaveGuard, decision 24). Mark done waits for uploads, and for each failed
 * photo to be retried or removed (decision 13): in the bar and in the sheet
 * it stays off over one danger line ("2 photos didn't upload · Retry"), and a
 * failed tile keeps its place with the Retry pill. "Add photos" is off while
 * the Mark done is sending: a photo picked then wouldn't go with it.
 *
 * One primary per screen (docs/brand-guidelines.md, section 9): the bar's next
 * step on the page, the sheet's Mark done inside it. Send is secondary.
 */
export function JobActions({
  taskId,
  status,
  firstName,
  staffNames,
}: {
  taskId: string;
  status: TaskStatus;
  firstName: string;
  staffNames: string[];
}) {
  const { toast } = useToast();
  const step = nextStep(status);

  const [body, setBody] = useState("");
  // Uploaded and recorded, not posted yet.
  const [ready, setReady] = useState<string[]>([]);
  const [sending, startSending] = useTransition();
  const [starting, startStarting] = useTransition();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetState, setSheetState] = useState<"ask" | "sent">("ask");
  const [note, setNote] = useState("");
  const [finishing, startFinishing] = useTransition();

  // onRecorded runs after the last upload lands, so it reads the latest of these.
  const live = useRef({ body, sheetOpen, ready });
  useEffect(() => {
    live.current = { body, sheetOpen, ready };
  });

  // Every call goes through callAction: with no signal it fails like a refusal
  // (a toast), and the typed text, the open sheet and the photos stay put.
  const post = (text: string, ids: string[]) =>
    startSending(async () => {
      const res = await callAction(() => postJobUpdateAction(taskId, { body: text, attachmentIds: ids }));
      if (!res.ok) {
        toast({ message: res.error });
        setReady((r) => [...new Set([...r, ...ids])]);
        return;
      }
      if (text) setBody((b) => (b.trim() === text ? "" : b));
    });

  const uploader = useMediaUploader({
    taskId,
    uploadKind: "portal-task-upload",
    record: (file) => recordJobUploadAction(taskId, file),
    onRecorded: (ids) => {
      const { sheetOpen: holding, body: text, ready: waiting } = live.current;
      if (holding || text.trim()) {
        setReady([...waiting, ...ids]);
        return;
      }
      setReady([]);
      post("", [...waiting, ...ids]);
    },
  });
  const { pending, failed } = uploader;

  // "My jobs" and the payoff's "Back to my jobs" ask before they cancel what's still going up.
  const goingUp = stillUploading(uploader.uploads.filter(isGoingUp).map((u) => u.kind));
  useHoldLeave(pending > 0 ? { title: goingUp, stay: "Keep uploading" } : null);

  // The photos a Mark done is sending right now, so leaving mid-send doesn't
  // post them a second time as an empty update.
  const finishingIds = useRef<string[]>([]);

  // Moving to another page in the app: post what's still held, as its own
  // update (any unsent text stays unsent). Read at unmount on purpose, so it's
  // the latest list; live is the same ref onRecorded reads.
  useEffect(() => {
    const latest = live;
    const inFlight = finishingIds;
    return () => {
      const held = latest.current.ready.filter((id) => !inFlight.current.includes(id));
      // Detached: nothing is left on this page to show a result, and a redirect needs no rethrow here.
      if (held.length > 0) postJobUpdateAction(taskId, { body: "", attachmentIds: held }).catch(() => {});
    };
  }, [taskId]);
  useLeaveWarning(ready.length > 0);

  // Bring the upload tiles into view when uploads start from the bar.
  const trayRef = useRef<HTMLDivElement>(null);
  const hadUploads = useRef(false);
  useEffect(() => {
    const has = uploader.uploads.length > 0;
    if (has && !hadUploads.current && !sheetOpen) {
      const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      trayRef.current?.scrollIntoView({ block: "nearest", behavior: smooth ? "smooth" : "auto" });
    }
    hadUploads.current = has;
  }, [uploader.uploads.length, sheetOpen]);

  const showBar = step !== null;
  useToastInset(showBar ? BAR_PX + (failed > 0 ? FAILED_LINE_PX : 0) : 0);

  function send() {
    const text = body.trim();
    if (!text && ready.length === 0) return;
    const ids = ready;
    setReady([]);
    post(text, ids);
  }

  function start() {
    startStarting(async () => {
      const res = await callAction(() => startJobAction(taskId));
      toast({ message: res.ok ? "Job started" : res.error });
    });
  }

  function openMarkDone() {
    setSheetState("ask");
    setSheetOpen(true);
  }

  function finish() {
    startFinishing(async () => {
      const ids = ready;
      finishingIds.current = ids;
      try {
        const res = await callAction(() => markJobDoneAction(taskId, { body: note.trim(), attachmentIds: ids }));
        if (!res.ok) {
          toast({ message: res.error });
          return;
        }
        setReady((r) => r.filter((id) => !ids.includes(id)));
        setNote("");
        setSheetState("sent");
      } finally {
        finishingIds.current = [];
      }
    });
  }

  const canSend = (body.trim() !== "" || ready.length > 0) && !sending;
  const done = markDoneButton({ pending, failed, sending: finishing, hasContent: ready.length > 0 || note.trim() !== "" });

  // Bar buttons share the width on phones and tablets; on a wide screen they size to a column at the end.
  const barButton = "h-12 min-w-0 flex-1 whitespace-nowrap lg:w-60 lg:flex-none";

  return (
    <>
      {/* Composer */}
      <div className="mt-4">
        <label htmlFor="job-update" className="sr-only">
          Write an update
        </label>
        <Textarea
          id="job-update"
          rows={2}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write an update…"
          className="resize-none"
        />
        {/* scroll-mb keeps the tiles clear of the sticky bar when they're scrolled into view. */}
        <div ref={trayRef} className="mt-2 flex scroll-mb-28 items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {/* The red line sits under the bar's buttons instead, with Retry. */}
            {!sheetOpen && <MediaUploadTray uploader={uploader} layout="grid" notice={false} />}
            {ready.length > 0 && !sheetOpen && (
              <p className="mt-1 truncate text-meta text-fg-3">
                {ready.length} upload{ready.length === 1 ? "" : "s"} ready to send
              </p>
            )}
          </div>
          <Button variant="secondary" size="sm" className="shrink-0" disabled={!canSend} onClick={send}>
            {sending ? "Sending…" : "Send"}
          </Button>
        </div>
      </div>

      {uploader.inputs}

      {/* Sticky bottom bar: the phone chrome, on --canvas over a --line rule. */}
      {showBar && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-canvas pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          {/* Same width and gutters as the page, so the buttons line up with the content. */}
          <div className="mx-auto max-w-300 space-y-2 px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3 lg:justify-end">
              {/* Photos can still go up while HG reviews; only the next step waits. */}
              <Button variant="secondary" className={cn(barButton, "max-[360px]:px-2")} onClick={uploader.chooseFiles}>
                <Camera className="h-4 w-4 shrink-0 max-[360px]:hidden" aria-hidden="true" />
                Add photo/video
              </Button>
              {step === "review" ? (
                <Button variant="secondary" disabled className={cn(barButton, "text-fg-3 disabled:opacity-100 max-[360px]:px-2")}>
                  {/* Half the bar on a phone: the short label there, so it never truncates. */}
                  <span className="truncate sm:hidden">Waiting for review</span>
                  <span className="truncate max-sm:hidden">Waiting for HG to review</span>
                </Button>
              ) : step === "start" ? (
                <Button className={barButton} disabled={starting} onClick={start}>
                  {starting ? "Starting…" : "Start job"}
                </Button>
              ) : (
                // Off while anything is still going up or failed; the line under the bar says which.
                <Button className={cn(barButton, "max-[360px]:px-2")} disabled={pending > 0 || failed > 0} onClick={openMarkDone}>
                  <span className="truncate">{pending > 0 ? finishingLabel(pending) : "Mark done"}</span>
                </Button>
              )}
            </div>
            <FailedUploadsLine uploader={uploader} className="lg:justify-end" />
          </div>
        </div>
      )}

      {/* Mark done, then the payoff */}
      <Sheet
        isOpen={sheetOpen}
        onOpenChange={(open) => {
          if (!open && finishing) return;
          setSheetOpen(open);
        }}
        isDismissable={!finishing}
        title={sheetState === "sent" ? "Sent for review" : "Mark done"}
        hideTitle={sheetState === "sent"}
        className="md:w-[28rem]"
      >
        {sheetState === "ask" ? (
          <div className="space-y-4 p-4">
            <p className="text-body font-medium text-fg-1">Add photos of the finished work?</p>
            <MediaUploadTray uploader={uploader} layout="grid" notice={false} />
            {ready.length > 0 && (
              <p className="text-meta text-fg-3">
                {ready.length} {ready.length === 1 ? "upload" : "uploads"} will go with it
              </p>
            )}
            <div>
              <label htmlFor="done-note" className="sr-only">
                Note
              </label>
              <Textarea
                id="done-note"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add a note (optional)"
                className="resize-none"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                {/* The picker, not the camera alone: on a phone it offers Take Photo and the library, so shots taken
                    earlier in the Camera app can go too. */}
                <Button variant="secondary" className="h-12 min-w-0 flex-1 whitespace-nowrap" disabled={finishing} onClick={uploader.chooseFiles}>
                  <ImagePlus className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Add photos
                </Button>
                {/* Off while a photo failed to upload: the red line under it says which (decision 13). */}
                <Button className="h-12 min-w-0 flex-1 whitespace-nowrap" disabled={!done.enabled} onClick={finish}>
                  <span className="truncate">{done.label}</span>
                </Button>
              </div>
              <FailedUploadsLine uploader={uploader} />
            </div>
          </div>
        ) : (
          <Payoff firstName={firstName} staffNames={staffNames} />
        )}
      </Sheet>
    </>
  );
}

/**
 * Under Mark done while any photo didn't upload (docs/brand-guidelines.md,
 * section 9 Photos): "2 photos didn't upload · Retry", Retry going for every
 * tile that can go again. Each tile's label keeps its reason. A file the check
 * refused (too big, wrong type) can only be removed, so it gets no Retry; with
 * nothing to retry, the line keeps the reason ("1 photo didn't upload: over
 * the 25 MB photo limit"), since it's the only place a sighted user sees why.
 */
function FailedUploadsLine({ uploader, className }: { uploader: MediaUploaderApi; className?: string }) {
  if (uploader.failed === 0) return null;
  const retryable = uploader.uploads.filter((u) => u.status === "failed");
  const line =
    (retryable.length > 0 ? uploader.failedLine : uploader.notice) ||
    `${uploader.failed} ${uploader.failed === 1 ? "file" : "files"} didn't upload`;
  return (
    <p className={cn("flex min-w-0 items-center justify-center gap-1 text-meta text-danger", className)}>
      <span className="truncate">{line}</span>
      {retryable.length > 0 && (
        <>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={() => retryable.forEach((u) => uploader.retry(u.key))}
            className="relative shrink-0 font-medium underline decoration-1 underline-offset-3 hover:decoration-2 pointer-coarse:after:absolute pointer-coarse:after:-inset-3"
          >
            Retry
          </button>
        </>
      )}
    </p>
  );
}

/**
 * After Mark done (docs/brand-guidelines.md, section 9 Empty and payoff
 * states): the job-done line art, a warm heading, who it went to and what
 * happens next, then the way back to the next job. A payoff tied to a
 * property shows its photo instead; this page has no property photos yet, so
 * it's the art until they exist.
 */
function Payoff({ firstName, staffNames }: { firstName: string; staffNames: string[] }) {
  const to = joinNames(staffNames) || "HG";
  // The button that opened this view is gone: move focus here, so it's read
  // out and Esc still closes the sheet.
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  // Through the page's LeaveGuard, like "My jobs": it asks first if anything is still going up.
  const guard = useLeaveGuard();
  const router = useRouter();
  return (
    <div className="flex flex-col items-center px-6 pb-6 pt-8 text-center">
      <SpotArt name="job-done" className="motion-safe:animate-pop-in" />
      <h2 ref={heading} tabIndex={-1} className="mt-4 text-title text-balance text-fg-1 outline-none">
        Thanks, {firstName}!
      </h2>
      <p className="mt-2 max-w-xs text-pretty text-body text-fg-2">
        Sent to {to}. You&apos;ll get an email if anything else is needed.
      </p>
      <LinkButton
        href="/p"
        variant="primary"
        className="mt-6 h-12 w-full"
        onClick={(e) => {
          // A new tab or window leaves nothing behind.
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          guard(() => router.push("/p"));
        }}
      >
        Back to my jobs
      </LinkButton>
    </div>
  );
}
