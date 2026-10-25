"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, Download, ImageOff, Trash2, X } from "lucide-react";
import { Button as AriaButton, Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { Sheet } from "@/components/sheet";
import { Button } from "@/components/ui";
import { callAction, type ActionResult } from "@/lib/action-result";
import { taskFileUrl } from "@/lib/attachments/media";
import { cn, fmtDateTime } from "@/lib/utils";

/** A task photo or video, as the grid and lightbox show it. */
export type MediaItem = {
  id: string;
  kind: "IMAGE" | "VIDEO";
  filename: string;
  /** The row has a thumbPathname: grids load ?v=thumb instead of the original. */
  hasThumb?: boolean;
  /** The row has a posterPathname (videos). */
  hasPoster?: boolean;
  durationSec?: number | null;
  /** Who added it: "Zack", "Connor". */
  uploadedBy?: string | null;
  /** Staff only: an Internal file, which the grid marks with a lock. */
  internal?: boolean;
  createdAt: Date | string;
};

const SWIPE_PX = 50;

/**
 * Full-screen viewer for task photos and videos on the dark photo stage: "3 / 11",
 * arrows and arrow keys, swipe on touch, Esc closes, Download, and who added
 * it when. Videos play inline (`playsInline`) from /api/files/task/<id>, which
 * redirects to a short-lived signed URL so iPhones can stream them.
 * React Aria Modal: focus trapped, page scroll locked, focus returns to the
 * tile that opened it. With `onDelete` (staff), a Delete button asks first
 * in a Sheet on top, so Esc closes only that.
 */
export function Lightbox({
  items,
  index,
  onIndexChange,
  isOpen,
  onOpenChange,
  onDelete,
}: {
  items: MediaItem[];
  index: number;
  onIndexChange: (index: number) => void;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** Removes the item for good; a server action can be passed as is. */
  onDelete?: (id: string) => Promise<ActionResult<unknown>>;
}) {
  const count = items.length;
  const i = Math.min(Math.max(index, 0), Math.max(count - 1, 0));
  const item = items[i];
  const canPrev = i > 0;
  const canNext = i < count - 1;
  const go = (to: number) => {
    if (to >= 0 && to < count) onIndexChange(to);
  };

  // Arrow keys step through. Not while a video has focus: there they seek.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest("video, input, textarea")) return;
      if (e.key === "ArrowLeft" && i > 0) onIndexChange(i - 1);
      else if (e.key === "ArrowRight" && i < count - 1) onIndexChange(i + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, i, count, onIndexChange]);

  const swipeFrom = useRef<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  // What the confirm is about, kept while it closes even if the list moves on.
  const [target, setTarget] = useState<MediaItem | null>(null);

  if (!item) return null;
  const byline = [item.uploadedBy, fmtDateTime(item.createdAt)].filter((s) => s && s !== "—").join(" · ");

  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable
      className="fixed inset-0 z-50 bg-photo-stage data-entering:animate-fade-in data-exiting:animate-fade-out motion-reduce:animate-none"
    >
      <Modal className="h-full w-full outline-none">
        <Dialog aria-label="Photos and videos" className="flex h-full flex-col text-on-photo outline-none">
          <header className="flex shrink-0 items-center gap-2 pl-4 pr-1.5 pt-[env(safe-area-inset-top)]">
            <div className="min-w-0 flex-1 py-2">
              <Heading slot="title" className="truncate text-sm font-medium">
                {item.filename}
              </Heading>
              {byline && <p className="truncate text-xs text-on-photo/70">{byline}</p>}
            </div>
            {count > 1 && (
              <span className="shrink-0 px-2 text-sm tabular-nums text-on-photo/70">
                <span aria-hidden="true">
                  {i + 1} / {count}
                </span>
                <span className="sr-only" aria-live="polite">
                  {`${i + 1} of ${count}`}
                </span>
              </span>
            )}
            <a href={taskFileUrl(item.id)} download={item.filename} aria-label="Download" className={stageButton}>
              <Download className="h-5 w-5" aria-hidden="true" />
            </a>
            {onDelete && (
              <AriaButton
                onPress={() => {
                  setTarget(item);
                  setConfirming(true);
                }}
                aria-label="Delete"
                className={stageButton}
              >
                <Trash2 className="h-5 w-5" aria-hidden="true" />
              </AriaButton>
            )}
            <AriaButton slot="close" aria-label="Close" className={stageButton}>
              <X className="h-5 w-5" aria-hidden="true" />
            </AriaButton>
          </header>

          <div
            className="relative flex min-h-0 flex-1 touch-pan-y items-center justify-center px-2 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-16"
            onPointerDown={(e) => {
              swipeFrom.current = e.pointerType !== "mouse" && !(e.target as HTMLElement).closest("video") ? e.clientX : null;
            }}
            onPointerUp={(e) => {
              const from = swipeFrom.current;
              swipeFrom.current = null;
              if (from === null) return;
              const dx = e.clientX - from;
              if (dx <= -SWIPE_PX) go(i + 1);
              else if (dx >= SWIPE_PX) go(i - 1);
            }}
            onPointerCancel={() => {
              swipeFrom.current = null;
            }}
          >
            <Stage key={item.id} item={item} />
            {canPrev && (
              <AriaButton onPress={() => go(i - 1)} aria-label="Previous" className={cn(stageButton, arrow, "left-2 sm:left-4")}>
                <ChevronLeft className="h-5 w-5" aria-hidden="true" />
              </AriaButton>
            )}
            {canNext && (
              <AriaButton onPress={() => go(i + 1)} aria-label="Next" className={cn(stageButton, arrow, "right-2 sm:right-4")}>
                <ChevronRight className="h-5 w-5" aria-hidden="true" />
              </AriaButton>
            )}
          </div>
          {onDelete && target && (
            <Sheet
              title={target.kind === "VIDEO" ? "Delete this video?" : "Delete this photo?"}
              isOpen={confirming}
              onOpenChange={setConfirming}
            >
              {({ close }) => <ConfirmDelete key={target.id} item={target} onDelete={onDelete} onDone={close} />}
            </Sheet>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

/** "It goes for good" with Keep it and Delete; a refusal stays on screen. */
function ConfirmDelete({
  item,
  onDelete,
  onDone,
}: {
  item: MediaItem;
  onDelete: (id: string) => Promise<ActionResult<unknown>>;
  onDone: () => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  return (
    <div className="space-y-4 p-4 md:w-96">
      <p className="text-sm text-fg-2">
        <span className="break-all">“{item.filename}”</span> goes for good.
      </p>
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" disabled={pending} onClick={onDone}>
          Keep it
        </Button>
        <Button
          variant="destructive"
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError("");
              const res = await callAction(() => onDelete(item.id));
              if (res.ok) onDone();
              else setError(res.error);
            })
          }
        >
          {pending ? "Deleting…" : item.kind === "VIDEO" ? "Delete video" : "Delete photo"}
        </Button>
      </div>
    </div>
  );
}

// On the fixed photo tokens, so the stage reads the same in either theme.
const stageButton =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-on-photo/80 transition-colors hover:bg-on-photo/10 hover:text-on-photo focus-visible:outline-on-photo";
// Touch screens swipe instead.
const arrow = "absolute top-1/2 -translate-y-1/2 bg-photo-scrim pointer-coarse:hidden";

/** One photo or video, centered and fit to the stage. */
function Stage({ item }: { item: MediaItem }) {
  // An original the browser can't draw (HEIC outside Safari) falls back to the thumbnail, then to a note.
  const [src, setSrc] = useState<string | null>(taskFileUrl(item.id));
  if (item.kind === "VIDEO") {
    return (
      <video
        src={taskFileUrl(item.id)}
        poster={item.hasPoster ? taskFileUrl(item.id, "poster") : undefined}
        controls
        playsInline
        preload="metadata"
        className="max-h-full max-w-full"
      />
    );
  }
  if (!src) {
    return (
      <p className="flex items-center gap-2 text-sm text-on-photo/70">
        <ImageOff className="h-5 w-5" aria-hidden="true" />
        This photo can&apos;t be shown here. Download it to view.
      </p>
    );
  }
  return (
    // Gated, session-checked route; next/image would cache it publicly.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={item.filename}
      draggable={false}
      onError={() => setSrc(src.includes("?v=thumb") || !item.hasThumb ? null : taskFileUrl(item.id, "thumb"))}
      className="max-h-full max-w-full select-none object-contain"
    />
  );
}
