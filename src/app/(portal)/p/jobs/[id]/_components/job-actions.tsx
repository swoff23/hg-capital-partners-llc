"use client";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Camera, ImagePlus, Play } from "lucide-react";
import type { TaskStatus } from "@prisma/client";
import { ActionBar, actionBarButton } from "@/components/action-bar";
import { useLeaveGuard } from "@/components/leave-guard";
import {
  MediaUploadTray,
  UploadStatusLine,
  UploadTile,
  useMediaUploader,
  type MediaUpload,
  type RecordMediaInput,
  type RecordMediaResult,
} from "@/components/media-uploader";
import { PhotoThumb } from "@/components/photo-thumb";
import { Sheet } from "@/components/sheet";
import { SpotArt } from "@/components/spot-art";
import { useToast } from "@/components/toast";
import { Button, LinkButton, Textarea } from "@/components/ui";
import { useUploadScope, type UploadTarget } from "@/components/upload-queue";
import { useCoarsePointer } from "@/components/use-coarse-pointer";
import { useLeaveWarning } from "@/components/use-leave-warning";
import { callAction } from "@/lib/action-result";
import { taskFileUrl } from "@/lib/attachments/media";
import {
  finishCountLabel,
  finishPhotosNeeded,
  finishSlots,
  joinNames,
  lateUploadsEndsIn,
  lateUploadsOpen,
  markDoneButton,
  nextStep,
  stripCounts,
} from "@/lib/portal/job-view";
import { recordedUploads, type RecordedUpload } from "@/lib/portal/recorded-uploads";
import { cn } from "@/lib/utils";
import { markJobDoneAction, postJobUpdateAction, startJobAction } from "../actions";
import { postRecordedBatch, recordJobFile } from "./record-and-post";

/**
 * The job page's writing half (§6, Job page): the update composer at the
 * end of the scroll, the sticky bottom bar (Add photo/video and the next
 * step), and the Mark done sheet with its payoff. One uploader serves all
 * three, so Mark done can wait for photos still going up.
 *
 * Photos picked from the bar post as one update once they're all up, unless
 * there's text in the composer: then they wait and go with it. While the Mark
 * done sheet is open they go with the Mark done instead. A batch that posts on
 * its own says "3 photos posted · Undo" for five seconds, and Undo takes the
 * update and its files back (uploads 2.7, question 5). Photos go up as a
 * `display` target: upright, a 2560px JPEG, no GPS, without the original
 * (question 3), and each carries when it joined the queue, so one taken before
 * Mark done still records after it, inside the hour (question 4). "Add
 * photo/video" stays on in Review for that hour, then hides.
 *
 * A held photo is already on the job, but HG only hears about it (the
 * timeline line and the email) once it's posted. Leaving the page for
 * another one in the app posts whatever is still held. A reload or a closed
 * tab asks first where the browser allows it (iOS Safari never does).
 *
 * Leaving never cancels what's still going up: the portal layout's upload
 * queue outlives the page, so "My jobs" and the payoff's "Back to my jobs"
 * don't ask (uploads 2.1; only Sign out does), and a batch that lands after
 * the contractor left posts on its own with the same Undo (choice 1 A; the
 * My jobs row says "Uploading 3 photos" meanwhile). If HG approved the job in
 * the meantime the photos still land on it, with no update and no email:
 * "3 photos added to the job" (record-and-post.ts), and late-uploads.tsx is the
 * page that records them once the job has no composer. Mark done waits for
 * uploads, and for each failed photo to be retried or removed (decision 13):
 * in the bar and in the sheet it stays off over one line ("2 photos didn't
 * upload · Retry" in danger, or "Finishing 2 uploads…" in grey), and a failed
 * tile keeps its place with the Retry pill. "Add photos" and the slots are
 * off while the Mark done is sending: a photo picked then wouldn't go with it.
 *
 * The Mark done sheet (uploads 2.8) is the proof slots, on the upload tray's
 * `slots`: "Photos of the finished work" with "1 of 2" when the playbook asks
 * for photos (`finishPhotosRequired`, off by default), the photos already up
 * as ready tiles, then empty camera squares up to that count (one on an
 * optional job), then one add tile. An empty slot opens the camera on touch
 * and the file picker with a mouse. There's no Skip: with no photos on an
 * optional job the primary reads "Mark done". Its pair is pinned under the
 * scroll, so the note's keyboard never covers it.
 *
 * One primary per screen (docs/brand-guidelines.md, section 9): the bar's next
 * step on the page, the sheet's Mark done inside it. Send is secondary.
 */

/** A file that's up and recorded, waiting to be posted: what the sheet shows in its slot and the payoff in its strip. */
type Recorded = RecordedUpload;

export function JobActions({
  taskId,
  status,
  firstName,
  staffNames,
  finishPhotosRequired,
  markedDoneAt,
  property,
}: {
  taskId: string;
  status: TaskStatus;
  firstName: string;
  staffNames: string[];
  /** Photos Mark done asks for, from the job's playbook (TaskTemplate.finishPhotosRequired). Null or 0: optional, as every job starts. */
  finishPhotosRequired?: number | null;
  /** When this contractor marked the job done (ISO), while it's in Review: "Add photo/video" hides an hour later. Without it, it stays. */
  markedDoneAt?: string | null;
  /** The building, for the upload's name and the payoff's photo: "56 Tamarack St" and its front photo. */
  property?: { label: string; photoUrl: string | null } | null;
}) {
  const { toast } = useToast();
  const owner = useUploadScope();
  const step = nextStep(status);
  const coarse = useCoarsePointer();
  const required = finishPhotosNeeded(finishPhotosRequired);

  const [body, setBody] = useState("");
  // Uploaded and recorded, not posted yet.
  const [ready, setReady] = useState<Recorded[]>([]);
  const [sending, startSending] = useTransition();
  const [starting, startStarting] = useTransition();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetState, setSheetState] = useState<"ask" | "sent">("ask");
  const [note, setNote] = useState("");
  // What HG received, for the payoff's strip.
  const [received, setReceived] = useState<Recorded[]>([]);
  const [finishing, startFinishing] = useTransition();
  // Set when this page marks the job done, so the hour starts at once without waiting for the page to refresh.
  const [markedNow, setMarkedNow] = useState<string | null>(null);

  // onRecorded runs after the last upload lands, so it reads the latest of these.
  const live = useRef({ body, sheetOpen, ready });
  useEffect(() => {
    live.current = { body, sheetOpen, ready };
  });

  // Every call goes through callAction: with no signal it fails like a refusal
  // (a toast), and the typed text, the open sheet and the photos stay put.
  const post = (text: string, items: Recorded[]) =>
    startSending(async () => {
      const ids = items.map((i) => i.id);
      const res = await callAction(() => postJobUpdateAction(taskId, { body: text, attachmentIds: ids }));
      if (!res.ok) {
        toast({ message: res.error });
        setReady((r) => [...r, ...items.filter((i) => !r.some((x) => x.id === i.id))]);
        return;
      }
      if (text) setBody((b) => (b.trim() === text ? "" : b));
    });

  /** Posts a batch as one update: "3 photos posted", and five seconds to take it back. False when it didn't post. */
  const sendBatch = (items: Recorded[]) => postRecordedBatch(taskId, items, toast, owner);

  /** A batch that posts on its own while the page is here. One that doesn't post goes back on the tray, to go with the next send. */
  const postBatch = (items: Recorded[]) =>
    startSending(async () => {
      if (await sendBatch(items)) return;
      setReady((r) => [...r, ...items.filter((i) => !r.some((x) => x.id === i.id))]);
    });

  /**
   * The record step for one file: it joins the job unposted, and its kind and previews are kept for the slot and
   * the strip, for the tab and not this page (record-and-post.ts).
   */
  const record = (file: RecordMediaInput, from?: string): Promise<RecordMediaResult> => recordJobFile(taskId, file, from);

  function onRecorded(ids: string[]) {
    const { sheetOpen: holding, body: text, ready: held } = live.current;
    const added = recordedUploads.take(taskId, ids);
    if (holding || text.trim()) {
      setReady([...held, ...added]);
      return;
    }
    setReady([]);
    postBatch([...held, ...added]);
  }

  /** A batch that landed after the contractor left the page: it posts as its own update, with the same toast and Undo. */
  function onAway(ids: string[]) {
    void sendBatch(recordedUploads.take(taskId, ids));
  }

  const target: UploadTarget = {
    key: `portal-task:${taskId}`,
    label: property?.label ?? "this job",
    uploadKind: "portal-task-upload",
    parentId: taskId,
    access: "private",
    allowed: ["image", "video"],
    // Photos go up upright, as a 2560px JPEG without GPS and without the original (question 3).
    prepare: "display",
    record,
    onRecorded,
    // Gone from the page, a contractor's photos still post as their own update.
    whenAway: "post",
    onAway,
    // The record step takes when each file joined the queue: one queued before Mark done still records inside the hour (question 4).
    sendQueuedAt: true,
  };
  const uploader = useMediaUploader({ target });
  const { pending, waiting, failed } = uploader;

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
      const held = latest.current.ready.map((r) => r.id).filter((id) => !inFlight.current.includes(id));
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

  // In Review, "Add photo/video" stays for the hour the server keeps taking files (question 4), then hides.
  const markedAt = markedNow ?? markedDoneAt ?? null;
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const left = lateUploadsEndsIn(markedAt, new Date());
    if (left === null || left <= 0) return;
    // setTimeout can't wait longer than about 24 days; an hour is far inside it.
    const timer = setTimeout(() => setClock(Date.now()), left + 250);
    return () => clearTimeout(timer);
  }, [markedAt]);
  const canAddMore = step !== "review" || lateUploadsOpen(markedAt, new Date(clock));

  const showBar = step !== null;
  // The bar grows by one line for the red Retry line, the "No signal" line or the "Finishing N uploads" line
  // (never two); ActionBar lifts the toast above whichever shows.
  const finishingLine = step !== "start" && step !== "review" && pending > 0 && failed === 0;

  function send() {
    const text = body.trim();
    if (!text && ready.length === 0) return;
    const items = ready;
    setReady([]);
    post(text, items);
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
      const items = ready;
      finishingIds.current = items.map((i) => i.id);
      try {
        const res = await callAction(() => markJobDoneAction(taskId, { body: note.trim(), attachmentIds: items.map((i) => i.id) }));
        if (!res.ok) {
          toast({ message: res.error });
          return;
        }
        setReady((r) => r.filter((x) => !items.some((i) => i.id === x.id)));
        setReceived(items);
        setNote("");
        setMarkedNow(new Date().toISOString());
        setSheetState("sent");
      } finally {
        finishingIds.current = [];
      }
    });
  }

  const canSend = (body.trim() !== "" || ready.length > 0) && !sending;
  const done = markDoneButton({ pending, waiting, failed, sending: finishing, uploaded: ready.length, required });

  // Bar buttons share the width on phones and tablets; on a wide screen they size to a column at the end.
  const barButton = actionBarButton;
  // The Mark done sheet's pair: half each on a phone, sized to their labels at the dialog's end from md.
  const sheetButton = "h-12 min-w-0 flex-1 whitespace-nowrap pointer-fine:h-9 md:flex-none";

  // The camera, for an empty slot on touch: the rear camera straight away, photos only (uploads 2.8).
  const cameraRef = useRef<HTMLInputElement>(null);
  const openSlot = () => (coarse ? cameraRef.current?.click() : uploader.chooseFiles());

  const slots = finishSlots(required);

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
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          if (e.target.files) uploader.addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {/* Sticky bottom bar: the phone chrome, on --canvas over a --line rule. */}
      {showBar && (
        <ActionBar
          secondary={
            // Photos can still go up while HG reviews, for the hour after Mark done; only the next step waits.
            canAddMore ? (
              <Button variant="secondary" className={cn(barButton, "max-[360px]:px-2")} onClick={uploader.chooseFiles}>
                <Camera className="h-4 w-4 shrink-0 max-[360px]:hidden" aria-hidden="true" />
                Add photo/video
              </Button>
            ) : undefined
          }
          primary={
            step === "review" ? (
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
              <Button className={cn(barButton, "max-[360px]:px-2")} disabled={pending > 0 || waiting > 0 || failed > 0} onClick={openMarkDone}>
                Mark done
              </Button>
            )
          }
          // The disabled Mark done's one-line reason: uploads still going up, or the red Retry line.
          error={
            finishingLine ? (
              <p className="text-center text-meta text-fg-3 lg:text-right">{done.line}</p>
            ) : failed > 0 || waiting > 0 ? (
              <UploadStatusLine uploader={uploader} className="lg:justify-end" />
            ) : null
          }
        />
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
        // Pinned under the photos and the note, so on a short phone the primary and why it's off stay in view.
        footer={
          sheetState === "ask" && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 md:justify-end">
                {/* The picker, not the camera alone: on a phone it offers Take Photo and the library, so shots taken
                    earlier in the Camera app can go too. */}
                <Button variant="secondary" className={sheetButton} disabled={finishing} onClick={uploader.chooseFiles}>
                  <ImagePlus className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Add photos
                </Button>
                {/* Off while a photo is still going up or failed, or short of the count: the line under it says which.
                    It keeps its label and shows its spinner while it sends. */}
                <Button className={sheetButton} disabled={!done.enabled} pending={done.busy} onClick={finish}>
                  <span className="truncate">{done.label}</span>
                </Button>
              </div>
              {failed > 0 || (waiting > 0 && pending === 0) ? (
                <UploadStatusLine uploader={uploader} className="md:justify-end" />
              ) : done.line ? (
                <p className="truncate text-center text-meta text-fg-3 md:text-right">{done.line}</p>
              ) : null}
            </div>
          )
        }
      >
        {sheetState === "ask" ? (
          <div className="space-y-4 p-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 text-body font-medium text-fg-1">
                {required > 0 ? "Photos of the finished work" : "Add photos of the finished work?"}
              </p>
              {required > 0 && <span className="shrink-0 text-meta tabular-nums text-fg-3">{finishCountLabel(required, ready.length)}</span>}
            </div>
            {/* The photos already up, then the ones going up, then empty slots up to the count asked for (one on an
                optional job), solid squares, never dashed; once the count is met, one add tile remains. */}
            <MediaUploadTray
              uploader={uploader}
              layout="grid"
              notice={false}
              label="Photos of the finished work"
              slots={slots}
              filled={ready.length}
              onSlot={openSlot}
              disabled={finishing}
              leading={ready.map((r) => (
                <UploadTile key={r.id} upload={readyUpload(r)} grid ready />
              ))}
            />
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
          </div>
        ) : (
          <Payoff firstName={firstName} staffNames={staffNames} received={received} property={property ?? null} />
        )}
      </Sheet>
    </>
  );
}

/** Where a recorded photo or video's picture is: its thumbnail, or the poster of a video, from the task file route. */
function previewOf(item: Recorded): string | null {
  if (item.kind === "video") return item.hasPoster ? taskFileUrl(item.id, "poster") : null;
  return taskFileUrl(item.id, item.hasThumb ? "thumb" : undefined);
}

/** A photo that's up and waiting for Mark done, as the tray's ready tile: its picture in its slot, no Retry, and no Remove (contractors delete nothing). */
function readyUpload(item: Recorded): MediaUpload {
  return { key: item.id, name: item.name, kind: item.kind, previewUrl: previewOf(item), progress: 1, status: "saving" };
}

/**
 * After Mark done (docs/brand-guidelines.md, section 9 Empty and payoff
 * states): the building's photo (the job-done line art until it has one), a
 * warm heading, the strip of what HG received, who it went to and what
 * happens next, then the way back to the next job. The strip opens nothing,
 * so the payoff stays one layer and one Esc closes it.
 */
function Payoff({
  firstName,
  staffNames,
  received,
  property,
}: {
  firstName: string;
  staffNames: string[];
  received: Recorded[];
  property: { label: string; photoUrl: string | null } | null;
}) {
  const to = joinNames(staffNames) || "HG";
  // The button that opened this view is gone: move focus here, so it's read
  // out and Esc still closes the sheet.
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  // Through the portal layout's LeaveGuard, like "My jobs": it asks first if anything is still going up.
  const guard = useLeaveGuard();
  const router = useRouter();
  const { shown, more } = stripCounts(received.length);
  return (
    <div className="flex flex-col items-center px-6 pb-6 pt-8 text-center">
      {property?.photoUrl ? (
        <PhotoThumb size="full" src={property.photoUrl} alt={`Front of ${property.label}`} className="w-full max-w-xs motion-safe:animate-pop-in" />
      ) : (
        <SpotArt name="job-done" className="motion-safe:animate-pop-in" />
      )}
      <h2 ref={heading} tabIndex={-1} className="mt-4 text-title text-balance text-fg-1 outline-none">
        Thanks, {firstName}!
      </h2>
      {received.length > 0 && (
        <ul aria-label={`${received.length} ${received.length === 1 ? "photo" : "photos"} sent`} className="mt-3 flex items-center justify-center gap-2">
          {received.slice(0, shown).map((r) => (
            <li key={r.id}>
              <StripThumb item={r} />
            </li>
          ))}
          {more > 0 && <li className="text-meta tabular-nums text-fg-3">+{more}</li>}
        </ul>
      )}
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

/** One thumb in the payoff's strip: the 48x36 photo box, or a play mark for a video with no poster. */
function StripThumb({ item }: { item: Recorded }): ReactNode {
  const src = previewOf(item);
  if (!src) {
    return (
      <span className="flex h-9 w-12 items-center justify-center rounded-lg bg-fill-1 text-fg-3 inset-shadow-photo-edge" aria-hidden="true">
        <Play className="size-4" />
      </span>
    );
  }
  return (
    <span aria-hidden="true">
      <PhotoThumb size={48} src={src} alt="" />
    </span>
  );
}
