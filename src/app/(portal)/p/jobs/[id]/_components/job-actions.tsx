"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { Camera, ImagePlus, Send } from "lucide-react";
import type { TaskStatus } from "@prisma/client";
import { MediaUploadTray, useMediaUploader } from "@/components/media-uploader";
import { Sheet } from "@/components/sheet";
import { useToast, useToastInset } from "@/components/toast";
import { Button, LinkButton, Textarea } from "@/components/ui";
import { callAction } from "@/lib/action-result";
import { finishingLabel, joinNames, nextStep } from "@/lib/portal/job-view";
import { markJobDoneAction, postJobUpdateAction, recordJobUploadAction, startJobAction } from "../actions";

/** Height of the sticky bar above the safe area: 48px buttons plus 12px padding each side. */
const BAR_PX = 72;

/**
 * The job page's writing half (§6, Job page): the update composer at the
 * end of the scroll, the sticky bottom bar (Add photo/video and the next
 * step), and the Mark done sheet with its payoff. One uploader serves all
 * three, so Mark done can wait for photos still going up.
 *
 * Photos picked from the bar post as their own update once they're all up,
 * unless there's text in the composer: then they wait and go with it. While
 * the Mark done sheet is open they go with the Mark done instead.
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
  const { pending } = uploader;

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
  useToastInset(showBar ? BAR_PX : 0);

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
      const res = await callAction(() => markJobDoneAction(taskId, { body: note.trim(), attachmentIds: ids }));
      if (!res.ok) {
        toast({ message: res.error });
        return;
      }
      setReady((r) => r.filter((id) => !ids.includes(id)));
      setNote("");
      setSheetState("sent");
    });
  }

  const canSend = (body.trim() !== "" || ready.length > 0) && !sending;
  const finishLabel = pending > 0 ? finishingLabel(pending) : finishing ? "Sending…" : ready.length > 0 || note.trim() ? "Mark done" : "Skip";

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
            {!sheetOpen && <MediaUploadTray uploader={uploader} />}
            {ready.length > 0 && !sheetOpen && (
              <p className="mt-1 truncate text-xs text-muted">
                {ready.length} upload{ready.length === 1 ? "" : "s"} ready to send
              </p>
            )}
          </div>
          <Button size="sm" className="shrink-0" disabled={!canSend} onClick={send}>
            {sending ? "Sending…" : "Send"}
          </Button>
        </div>
      </div>

      {uploader.inputs}

      {/* Sticky bottom bar */}
      {showBar && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          {/* Same width and gutters as the page, so the buttons line up with the content. */}
          <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 sm:px-6">
            {/* Photos can still go up while HG reviews; only the next step waits. */}
            <Button variant="secondary" className="h-12 min-w-0 flex-1 whitespace-nowrap max-[359px]:px-2" onClick={uploader.chooseFiles}>
              <Camera className="h-4 w-4 shrink-0 max-[359px]:hidden" aria-hidden="true" />
              Add photo/video
            </Button>
            {step === "review" ? (
              <Button variant="secondary" disabled className="h-12 min-w-0 flex-1 whitespace-nowrap text-muted disabled:opacity-100 max-[359px]:px-2">
                {/* Half the bar on a phone: the short label there, so it never truncates. */}
                <span className="truncate sm:hidden">Waiting for review</span>
                <span className="truncate max-sm:hidden">Waiting for HG to review</span>
              </Button>
            ) : step === "start" ? (
              <Button className="h-12 min-w-0 flex-1 whitespace-nowrap" disabled={starting} onClick={start}>
                {starting ? "Starting…" : "Start job"}
              </Button>
            ) : (
              <Button className="h-12 min-w-0 flex-1 whitespace-nowrap max-[359px]:px-2" disabled={pending > 0} onClick={openMarkDone}>
                <span className="truncate">{pending > 0 ? finishingLabel(pending) : "Mark done"}</span>
              </Button>
            )}
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
            <p className="text-base font-semibold">Add photos of the finished work?</p>
            <MediaUploadTray uploader={uploader} />
            {ready.length > 0 && (
              <p className="text-xs text-muted">
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
            <div className="flex items-center gap-3">
              {/* The picker, not the camera alone: on a phone it offers Take Photo and the library, so shots taken
                  earlier in the Camera app can go too. */}
              <Button variant="secondary" className="h-12 min-w-0 flex-1 whitespace-nowrap" onClick={uploader.chooseFiles}>
                <ImagePlus className="h-4 w-4 shrink-0" aria-hidden="true" />
                Add photos
              </Button>
              <Button className="h-12 min-w-0 flex-1 whitespace-nowrap" disabled={pending > 0 || finishing} onClick={finish}>
                <span className="truncate">{finishLabel}</span>
              </Button>
            </div>
          </div>
        ) : (
          <Payoff firstName={firstName} staffNames={staffNames} />
        )}
      </Sheet>
    </>
  );
}

/** After Mark done: who it went to and what happens next (CLAUDE.md, payoff moments). */
function Payoff({ firstName, staffNames }: { firstName: string; staffNames: string[] }) {
  const to = joinNames(staffNames) || "HG";
  // The button that opened this view is gone: move focus here, so it's read
  // out and Esc still closes the sheet.
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <div className="flex flex-col items-center px-6 pb-6 pt-8 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-primary motion-safe:animate-pop-in">
        <Send className="h-6 w-6" aria-hidden="true" />
      </span>
      <h2 ref={heading} tabIndex={-1} className="mt-4 text-lg font-semibold tracking-tight outline-none">
        Thanks, {firstName}!
      </h2>
      <p className="mt-1.5 max-w-xs text-sm text-muted">
        Sent to {to}. You&apos;ll get an email if anything else is needed.
      </p>
      <LinkButton href="/p" variant="primary" className="mt-6 h-12 w-full">
        Back to my jobs
      </LinkButton>
    </div>
  );
}
