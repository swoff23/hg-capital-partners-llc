"use client";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Ellipsis,
  ExternalLink,
  FileImage,
  FileSpreadsheet,
  FileText,
  ImageOff,
  Lock,
  Minus,
  Pencil,
  Plus,
  Share,
  Trash2,
  X,
} from "lucide-react";
import { Button as AriaButton, Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Menu, MenuItem, MenuTrigger } from "@/components/menu";
import { Button, Input } from "@/components/ui";
import { useCoarsePointer } from "@/components/use-coarse-pointer";
import { useFocusAfterMenu } from "@/components/use-focus-after-menu";
import { useInlineEditKeys } from "@/components/use-inline-edit-keys";
import { callAction, type ActionResult } from "@/lib/action-result";
import { byline, documentLook, downloadUrl, taskFileUrl } from "@/lib/attachments/media";
import { cn, formatBytes } from "@/lib/utils";

/** A task photo, video or document, as the grid and lightbox show it. */
export type MediaItem = {
  id: string;
  /** A document (FILE) opens in the viewer's own sequence from a file row (uploads 2.6). */
  kind: "IMAGE" | "VIDEO" | "FILE";
  filename: string;
  /** The row has a thumbPathname: grids load ?v=thumb instead of the original. */
  hasThumb?: boolean;
  /** The row has a posterPathname (videos). */
  hasPoster?: boolean;
  durationSec?: number | null;
  /** Bytes, for a document's card. */
  size?: number | null;
  /** Who added it: "Zack", "Connor". */
  uploadedBy?: string | null;
  /** Staff only: an Internal file, which the grid marks with a lock and the viewer's byline names. */
  internal?: boolean;
  createdAt: Date | string;
};

/**
 * Where an item's bytes are: the original, or its thumbnail or poster.
 * Task files default to /api/files/task/<id> (taskFileUrl); property files
 * and public listing photos pass their own (uploads 2.5, G1D-001).
 */
export type MediaUrlFor = (item: MediaItem, variant?: "thumb" | "poster") => string;

export const taskMediaUrl: MediaUrlFor = (item, variant) => taskFileUrl(item.id, variant);

/** One action in the viewer's ⋯ menu for an item: a listing's Make cover, "Set as property photo". */
export type LightboxMenuItem = {
  id: string;
  label: string;
  icon?: ReactNode;
  /** Delete and Remove: drawn in --danger, last. */
  destructive?: boolean;
  onAction: () => void;
};

/** Which ground the viewer opens on: the app's, the portal's, or the public site's (its overlay root gets data-surface="public"). */
export type LightboxSurface = "app" | "portal" | "public";

const SWIPE_PX = 50;
const CLOSE_PX = 90;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const DOUBLE_ZOOM = 2;
const ZOOM_STEP = 1.25;
/** Where a key press belongs to something above the photo: a text field, the ⋯ menu, the delete question. The viewer's keys stay out. */
const KEYS_FOR_LAYERS_ABOVE = "input, textarea, [role=menu], [role=alertdialog]";

/**
 * Full-screen viewer on the dark photo stage (docs/specs/uploads-photos.md
 * 2.6) for photos, videos and documents: a name over who added it and when,
 * Download, a ⋯ menu and Close in the header; arrows, arrow keys and swipe
 * to step; "3 / 11" bottom right. React Aria Modal: focus trapped, page
 * scroll locked, focus returns to the tile that opened it, one Esc per layer
 * (an open menu or the delete question first, then the viewer).
 *
 * Photos zoom: the wheel or a trackpad pinch around the pointer up to 400%,
 * double-click or double-tap between fit and 200%, drag to pan, + and - keys
 * and 0 for fit, a zoom bar with a mouse; a pinch and one-finger pan on
 * touch. At fit a horizontal swipe steps (the photo follows the finger) and a
 * swipe down closes. Zoom is a view state, not a layer: Esc never spends a
 * press on it, and the arrow keys step only at fit. Videos play inline from
 * the file route, which redirects to a short-lived signed URL so iPhones can
 * stream them. Documents: a PDF opens in the browser's own viewer in a frame
 * with a mouse; every other document, and a PDF on touch, is a file card with
 * its Download or Open button. A photo the browser can't draw (HEIC outside
 * Safari, no thumbnail) says so, with Download.
 *
 * `urlFor` points the stage and Download at files outside the task route.
 * `surface="public"` (from /rentals) puts the public tokens on the overlay and
 * leaves Download and the ⋯ out; `header` replaces the name and byline (the
 * street and rent). The portal's viewer has Download and no ⋯. `menuItems`
 * adds a listing's Make cover and the staff's "Set as property photo" to the
 * ⋯; with `onDelete` it also has Delete, asked in a ConfirmDialog on top, and
 * with `canEdit` and `onRename` a Rename in place.
 */
export function Lightbox({
  items,
  index,
  onIndexChange,
  isOpen,
  onOpenChange,
  onDelete,
  onRename,
  urlFor = taskMediaUrl,
  surface = "app",
  header,
  menuItems,
  canEdit = false,
}: {
  items: readonly MediaItem[];
  index: number;
  onIndexChange: (index: number) => void;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** Removes the item for good; a server action can be passed as is. */
  onDelete?: (id: string) => Promise<ActionResult<unknown>>;
  /** Renames the item (staff with `canEdit`); resolves to the saved name. */
  onRename?: (id: string, name: string) => Promise<ActionResult<{ filename: string }>>;
  /** Where each item's bytes are; task files by default. */
  urlFor?: MediaUrlFor;
  /** The ground: "public" from /rentals. */
  surface?: LightboxSurface;
  /** Replaces the name and byline: the public viewer's street and rent ("56 Tamarack St · $1,450/mo"). */
  header?: { title: ReactNode; byline?: ReactNode };
  /** The ⋯ menu's actions for the item on screen. */
  menuItems?: (item: MediaItem) => readonly LightboxMenuItem[];
  /** Staff who may rename here. */
  canEdit?: boolean;
}) {
  const coarse = useCoarsePointer();
  const count = items.length;
  const i = Math.min(Math.max(index, 0), Math.max(count - 1, 0));
  const item = items[i];
  const canPrev = i > 0;
  const canNext = i < count - 1;
  const go = useCallback(
    (to: number) => {
      if (to >= 0 && to < count) onIndexChange(to);
    },
    [count, onIndexChange],
  );

  // Zoom belongs to the photo on the stage; the arrow keys need to know it's off fit.
  const [zoomed, setZoomed] = useState(false);
  const [confirming, setConfirming] = useState<MediaItem | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [names, setNames] = useState<Record<string, string>>({});

  // Arrow keys step through, at fit. Not while a video has focus (there they seek), a name is being typed, or a layer
  // above the photo is up: the ⋯ menu and the delete question act on this photo, so it must not change under them.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (confirming || renaming || e.defaultPrevented) return;
      if ((e.target as HTMLElement | null)?.closest(`video, ${KEYS_FOR_LAYERS_ABOVE}`)) return;
      if (zoomed) return;
      if (e.key === "ArrowLeft") go(i - 1);
      else if (e.key === "ArrowRight") go(i + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, i, go, zoomed, confirming, renaming]);

  // The neighbors load before they're asked for, thumbnail first.
  useEffect(() => {
    if (!isOpen) return;
    for (const n of [items[i - 1], items[i + 1]]) {
      if (n?.kind === "IMAGE") new Image().src = urlFor(n, n.hasThumb ? "thumb" : undefined);
    }
  }, [isOpen, i, items, urlFor]);

  // Gestures on a video or a document: a swipe steps, as before. A photo handles its own.
  const swipeFrom = useRef<number | null>(null);

  if (!item) return null;
  const name = names[item.id] ?? item.filename;
  const url = urlFor(item);
  const title = header?.title ?? name;
  const sub =
    header !== undefined
      ? header.byline
      : (
          <>
            <span className="max-sm:hidden">{byline(item.uploadedBy, item.createdAt, { time: true })}</span>
            <span className="sm:hidden">{byline(item.uploadedBy, item.createdAt)}</span>
            {item.internal && (
              <>
                {" · "}
                <Lock className="mb-0.5 inline size-3.5" aria-hidden="true" /> Internal
              </>
            )}
          </>
        );
  const actions = menuItems?.(item) ?? [];
  const plain = actions.filter((a) => !a.destructive);
  const destructive = actions.filter((a) => a.destructive);
  const staff = surface === "app";
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  // Only staff with something to do get a ⋯: a contractor's viewer is Download and Close, as it was.
  const hasMenu = staff && (!!onDelete || plain.length > 0 || destructive.length > 0 || (canEdit && !!onRename));

  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable
      data-surface={surface === "public" ? "public" : undefined}
      className="fixed inset-0 z-50 bg-photo-stage data-entering:animate-fade-in data-exiting:animate-fade-out motion-reduce:animate-none"
    >
      <Modal className="h-full w-full outline-none">
        <Dialog aria-label={item.kind === "FILE" ? "Files" : "Photos and videos"} className="relative flex h-full flex-col text-on-photo outline-none">
          <header className="flex shrink-0 items-center gap-1 pl-4 pr-1.5 pt-[env(safe-area-inset-top)]">
            <div className="min-w-0 flex-1 py-2">
              {renaming ? (
                <RenameField
                  value={name}
                  onCancel={() => setRenaming(false)}
                  onSave={async (next) => {
                    if (next === name) return setRenaming(false);
                    const res = await callAction(() => onRename!(item.id, next));
                    if (res.ok) setNames((n) => ({ ...n, [item.id]: res.data.filename }));
                    setRenaming(false);
                  }}
                />
              ) : (
                <Heading slot="title" className="truncate text-body">
                  {title}
                </Heading>
              )}
              {sub ? <p className="truncate text-meta text-on-photo/70">{sub}</p> : null}
            </div>
            {surface !== "public" && (
              <a href={downloadUrl(url)} download={item.filename} aria-label="Download" className={stageButton}>
                <Download className="size-5 pointer-fine:size-4" aria-hidden="true" />
              </a>
            )}
            {hasMenu && (
              <MenuTrigger>
                <AriaButton aria-label="More" className={stageButton}>
                  <Ellipsis className="size-5 pointer-fine:size-4" aria-hidden="true" />
                </AriaButton>
                <Menu placement="bottom end">
                  {!coarse && (
                    <MenuItem id="open" href={url} target="_blank" rel="noreferrer" icon={<ExternalLink />}>
                      Open in new tab
                    </MenuItem>
                  )}
                  {coarse && canShare && (
                    <MenuItem
                      id="share"
                      icon={<Share />}
                      onAction={() => void navigator.share({ title: name, url: new URL(url, window.location.origin).toString() }).catch(() => {})}
                    >
                      Share
                    </MenuItem>
                  )}
                  {canEdit && onRename && (
                    <MenuItem id="rename" icon={<Pencil />} onAction={() => setRenaming(true)}>
                      Rename
                    </MenuItem>
                  )}
                  {plain.map((a) => (
                    <MenuItem key={a.id} id={a.id} icon={a.icon} onAction={a.onAction}>
                      {a.label}
                    </MenuItem>
                  ))}
                  {destructive.map((a) => (
                    <MenuItem key={a.id} id={a.id} variant="destructive" icon={a.icon} onAction={a.onAction}>
                      {a.label}
                    </MenuItem>
                  ))}
                  {onDelete && (
                    <MenuItem id="delete" variant="destructive" icon={<Trash2 />} onAction={() => setConfirming(item)}>
                      Delete
                    </MenuItem>
                  )}
                </Menu>
              </MenuTrigger>
            )}
            <AriaButton slot="close" aria-label="Close" className={stageButton}>
              <X className="size-5 pointer-fine:size-4" aria-hidden="true" />
            </AriaButton>
          </header>

          <div
            className={cn("relative flex min-h-0 flex-1 items-center justify-center px-2 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-16", item.kind !== "IMAGE" && "touch-pan-y")}
            onPointerDown={(e) => {
              swipeFrom.current = item.kind !== "IMAGE" && e.pointerType !== "mouse" && !(e.target as HTMLElement).closest("video, iframe") ? e.clientX : null;
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
            <Stage
              key={item.id}
              item={{ ...item, filename: name }}
              urlFor={urlFor}
              owner={byline(item.uploadedBy, item.createdAt)}
              coarse={coarse}
              onZoomedChange={setZoomed}
              onStep={(by) => go(i + by)}
              onClose={() => onOpenChange(false)}
            />
            {canPrev && (
              <AriaButton onPress={() => go(i - 1)} aria-label="Previous" className={cn(stageButton, arrow, "left-2 sm:left-4")}>
                <ChevronLeft className="size-5" aria-hidden="true" />
              </AriaButton>
            )}
            {canNext && (
              <AriaButton onPress={() => go(i + 1)} aria-label="Next" className={cn(stageButton, arrow, "right-2 sm:right-4")}>
                <ChevronRight className="size-5" aria-hidden="true" />
              </AriaButton>
            )}
          </div>
          {count > 1 && (
            <span className="pointer-events-none absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] right-3 rounded-full bg-photo-scrim px-2 py-1 text-micro tabular-nums text-on-photo">
              <span aria-hidden="true">
                {i + 1} / {count}
              </span>
              <span className="sr-only" aria-live="polite">
                {`${i + 1} of ${count}`}
              </span>
            </span>
          )}
          {confirming && onDelete && (
            <DeleteQuestion
              key={confirming.id}
              item={confirming}
              name={names[confirming.id] ?? confirming.filename}
              onDelete={onDelete}
              onClose={() => setConfirming(null)}
            />
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

/** The name in place: Enter saves, Esc puts it back (and leaves the viewer open). */
function RenameField({ value, onSave, onCancel }: { value: string; onSave: (name: string) => void | Promise<void>; onCancel: () => void }) {
  const [text, setText] = useState(value);
  const field = useRef<HTMLInputElement>(null);
  useFocusAfterMenu(field);
  const keys = useInlineEditKeys(onCancel, () => void onSave(text.trim() || value));
  return (
    <Input
      ref={field}
      size="sm"
      aria-label="File name"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={keys.onBlur}
      onKeyDown={(e) => {
        // One Esc closes one layer: this one is the edit, not the viewer.
        if (e.key === "Escape") e.stopPropagation();
        keys.onKeyDown(e);
      }}
    />
  );
}

/** "Delete this photo?": asked in a ConfirmDialog on top of the viewer, so Esc closes only that. A refusal stays in its body. */
function DeleteQuestion({
  item,
  name,
  onDelete,
  onClose,
}: {
  item: MediaItem;
  name: string;
  onDelete: (id: string) => Promise<ActionResult<unknown>>;
  onClose: () => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const noun = item.kind === "VIDEO" ? "video" : item.kind === "FILE" ? "file" : "photo";
  return (
    <ConfirmDialog
      title={`Delete this ${noun}?`}
      body={
        <>
          <span className="break-all">“{name}”</span> goes for good.
          {error && <span className="mt-2 block text-meta text-danger">{error}</span>}
        </>
      }
      cancelLabel="Keep it"
      busy={pending}
      onClose={onClose}
      actions={
        <Button
          variant="destructive"
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError("");
              const res = await callAction(() => onDelete(item.id));
              if (res.ok) onClose();
              else setError(res.error);
            })
          }
        >
          {pending ? "Deleting…" : `Delete ${noun}`}
        </Button>
      }
    />
  );
}

// On the fixed photo tokens, so the stage reads the same in either theme. Square: an icon-only button is never round.
// 36px with a mouse, 44px on touch.
const stageButton =
  "flex size-11 shrink-0 items-center justify-center rounded-md text-on-photo/80 transition-colors hover:bg-on-photo/10 hover:text-on-photo focus-visible:outline-on-photo pointer-fine:size-9";
// Touch screens swipe instead.
const arrow = "absolute top-1/2 -translate-y-1/2 bg-photo-scrim pointer-coarse:hidden";

/** The labeled button on the stage, in the photo-mark colors: Download or Open on a card. */
const stageLabeled =
  "inline-flex h-11 items-center justify-center gap-2 rounded-md bg-pill-bg px-4 text-label font-medium text-pill-fg";

/** One item on the stage: a photo with zoom, a video, a PDF in a frame, or a card. */
function Stage({
  item,
  urlFor,
  owner,
  coarse,
  onZoomedChange,
  onStep,
  onClose,
}: {
  item: MediaItem;
  urlFor: MediaUrlFor;
  owner: string;
  coarse: boolean;
  onZoomedChange: (zoomed: boolean) => void;
  onStep: (by: number) => void;
  onClose: () => void;
}) {
  const url = urlFor(item);
  if (item.kind === "VIDEO") {
    return (
      <video
        src={url}
        poster={item.hasPoster ? urlFor(item, "poster") : undefined}
        controls
        playsInline
        preload="metadata"
        className="max-h-full max-w-full"
      />
    );
  }
  // A photo kept as a document (an insurance card's JPG) opens as the photo it is; a HEIC the browser can't draw falls back inside PhotoStage.
  if (item.kind === "FILE" && documentLook(item.filename).glyph !== "image") return <DocumentStage item={item} url={url} owner={owner} coarse={coarse} />;
  return <PhotoStage item={item} urlFor={urlFor} coarse={coarse} onZoomedChange={onZoomedChange} onStep={onStep} onClose={onClose} />;
}

/** A document: a PDF in the browser's own viewer with a mouse; anything else, and a PDF on touch, as a card. */
function DocumentStage({ item, url, owner, coarse }: { item: MediaItem; url: string; owner: string; coarse: boolean }) {
  const look = documentLook(item.filename);
  const Glyph = look.glyph === "sheet" ? FileSpreadsheet : look.glyph === "image" ? FileImage : FileText;
  if (look.label === "PDF" && !coarse) {
    return <iframe src={url} title={item.filename} className="h-full w-full max-w-[60rem] rounded-md bg-surface" />;
  }
  const meta = [look.label, item.size ? formatBytes(item.size) : null, owner].filter(Boolean).join(" · ");
  const pdf = look.label === "PDF";
  return (
    <div className="flex max-w-full flex-col items-center gap-3 px-4 text-center">
      <Glyph className="size-10" strokeWidth={1.5} aria-hidden="true" />
      <p className="max-w-full break-words text-body">{item.filename}</p>
      <p className="text-meta text-on-photo/70">{meta}</p>
      {pdf ? (
        <a href={url} target="_blank" rel="noreferrer" className={stageLabeled}>
          <ExternalLink className="size-4" aria-hidden="true" />
          Open
        </a>
      ) : (
        <a href={downloadUrl(url)} download={item.filename} className={stageLabeled}>
          <Download className="size-4" aria-hidden="true" />
          Download
        </a>
      )}
    </div>
  );
}

type View = { scale: number; x: number; y: number };
const FIT: View = { scale: MIN_ZOOM, x: 0, y: 0 };

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * A photo, centered and fit to the stage, with zoom and pan. An original the
 * browser can't draw (HEIC outside Safari) falls back to the thumbnail, then
 * to a note with Download.
 */
function PhotoStage({
  item,
  urlFor,
  coarse,
  onZoomedChange,
  onStep,
  onClose,
}: {
  item: MediaItem;
  urlFor: MediaUrlFor;
  coarse: boolean;
  onZoomedChange: (zoomed: boolean) => void;
  onStep: (by: number) => void;
  onClose: () => void;
}) {
  const thumb = item.hasThumb ? urlFor(item, "thumb") : null;
  const [src, setSrc] = useState<string | null>(urlFor(item));
  const [view, setView] = useState<View>(FIT);
  // The photo following a finger at fit: a swipe to step, or down to close.
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const viewRef = useRef(view);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ kind: "pan" | "swipe" | "pinch"; start: View; from: { x: number; y: number }; dist: number; moved: boolean } | null>(null);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);

  const zoomed = view.scale > MIN_ZOOM;
  useEffect(() => {
    onZoomedChange(zoomed);
    return () => onZoomedChange(false);
  }, [zoomed, onZoomedChange]);

  /** Keeps the photo from being dragged off the stage: at scale s it may travel by what it overflows. */
  const limit = useCallback((v: View): View => {
    const f = frame.current;
    const el = img.current;
    if (!f || !el) return v;
    const slackX = Math.max(0, (el.clientWidth * v.scale - f.clientWidth) / 2);
    const slackY = Math.max(0, (el.clientHeight * v.scale - f.clientHeight) / 2);
    return { scale: v.scale, x: clamp(v.x, -slackX, slackX), y: clamp(v.y, -slackY, slackY) };
  }, []);

  const commit = useCallback(
    (v: View) => {
      const next = v.scale <= MIN_ZOOM ? FIT : limit(v);
      viewRef.current = next;
      setView(next);
    },
    [limit],
  );

  /** Zooms to `scale`, keeping the point (px, py) from the stage's center where it is. */
  const zoomTo = useCallback(
    (scale: number, px = 0, py = 0) => {
      const cur = viewRef.current;
      const s = clamp(scale, MIN_ZOOM, MAX_ZOOM);
      const k = s / cur.scale;
      commit({ scale: s, x: px - (px - cur.x) * k, y: py - (py - cur.y) * k });
    },
    [commit],
  );

  const centerOf = (clientX: number, clientY: number) => {
    const r = frame.current?.getBoundingClientRect();
    return r ? { x: clientX - (r.left + r.width / 2), y: clientY - (r.top + r.height / 2) } : { x: 0, y: 0 };
  };

  // The wheel and a trackpad pinch (which arrives as ctrl+wheel) zoom around the pointer. A native listener: React's is passive.
  useEffect(() => {
    const f = frame.current;
    if (!f) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const c = centerOf(e.clientX, e.clientY);
      zoomTo(viewRef.current.scale * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0025)), c.x, c.y);
    };
    f.addEventListener("wheel", onWheel, { passive: false });
    return () => f.removeEventListener("wheel", onWheel);
  }, [zoomTo]);

  // + and - step, 0 goes back to fit.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || (e.target as HTMLElement | null)?.closest(KEYS_FOR_LAYERS_ABOVE) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "+" || e.key === "=") zoomTo(viewRef.current.scale * ZOOM_STEP);
      else if (e.key === "-" || e.key === "_") zoomTo(viewRef.current.scale / ZOOM_STEP);
      else if (e.key === "0") commit(FIT);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomTo, commit]);

  const dist = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const mid = () => {
    const [a, b] = [...pointers.current.values()];
    return centerOf((a.x + b.x) / 2, (a.y + b.y) / 2);
  };

  function down(e: ReactPointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button, a")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      gesture.current = { kind: "pinch", start: viewRef.current, from: mid(), dist: dist(), moved: true };
    } else if (pointers.current.size === 1) {
      const cur = viewRef.current;
      gesture.current = { kind: cur.scale > MIN_ZOOM ? "pan" : "swipe", start: cur, from: { x: e.clientX, y: e.clientY }, dist: 0, moved: false };
    }
  }

  function move(e: ReactPointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || !pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (g.kind === "pinch" && pointers.current.size >= 2) {
      const m = mid();
      const s = clamp(g.start.scale * (dist() / g.dist), MIN_ZOOM, MAX_ZOOM);
      const k = s / g.start.scale;
      commit({ scale: s, x: m.x - (g.from.x - g.start.x) * k, y: m.y - (g.from.y - g.start.y) * k });
      return;
    }
    const dx = e.clientX - g.from.x;
    const dy = e.clientY - g.from.y;
    if (Math.hypot(dx, dy) > 4) g.moved = true;
    if (g.kind === "pan") commit({ scale: g.start.scale, x: g.start.x + dx, y: g.start.y + dy });
    // A mouse doesn't swipe: it steps with the arrows and the keyboard.
    else if (g.kind === "swipe" && e.pointerType !== "mouse") setDrag({ x: dx, y: dy });
  }

  function up(e: ReactPointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    pointers.current.delete(e.pointerId);
    if (!g) return;
    if (g.kind === "pinch") {
      // One finger left: it carries on as a pan, from where it is.
      if (pointers.current.size === 1) {
        const [only] = [...pointers.current.values()];
        gesture.current = { kind: viewRef.current.scale > MIN_ZOOM ? "pan" : "swipe", start: viewRef.current, from: only, dist: 0, moved: true };
      } else gesture.current = null;
      return;
    }
    gesture.current = null;
    const dx = e.clientX - g.from.x;
    const dy = e.clientY - g.from.y;
    setDrag(null);
    if (g.kind === "swipe" && e.pointerType !== "mouse") {
      if (dy >= CLOSE_PX && dy > Math.abs(dx)) return onClose();
      if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy)) return onStep(dx < 0 ? 1 : -1);
    }
    // A second tap close to the first, soon after: fit to 200% and back.
    if (!g.moved && e.pointerType !== "mouse") {
      const prev = lastTap.current;
      const now = performance.now();
      if (prev && now - prev.t < 300 && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < 24) {
        lastTap.current = null;
        const c = centerOf(e.clientX, e.clientY);
        if (viewRef.current.scale > MIN_ZOOM) commit(FIT);
        else zoomTo(DOUBLE_ZOOM, c.x, c.y);
      } else lastTap.current = { t: now, x: e.clientX, y: e.clientY };
    }
  }

  if (!src) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 text-center">
        <p className="flex items-center gap-2 text-body text-on-photo/70">
          <ImageOff className="size-5 shrink-0" aria-hidden="true" />
          Can&apos;t preview this photo here.
        </p>
        <a href={downloadUrl(urlFor(item))} download={item.filename} className={stageLabeled}>
          <Download className="size-4" aria-hidden="true" />
          Download
        </a>
      </div>
    );
  }

  const shown = drag ? { x: view.x + (view.scale > MIN_ZOOM ? 0 : drag.x), y: view.y + (view.scale > MIN_ZOOM ? 0 : Math.max(0, drag.y)) } : view;
  return (
    <div
      ref={frame}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onDoubleClick={(e) => {
        // Touch has its own double tap (above); this is the mouse's.
        if (coarse) return;
        const c = centerOf(e.clientX, e.clientY);
        if (viewRef.current.scale > MIN_ZOOM) commit(FIT);
        else zoomTo(DOUBLE_ZOOM, c.x, c.y);
      }}
      className={cn("relative flex h-full w-full touch-none items-center justify-center overflow-hidden", zoomed && "pointer-fine:cursor-grab")}
    >
      {/* Gated, session-checked route; next/image would cache it publicly. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={img}
        src={src}
        alt={item.filename}
        draggable={false}
        onError={() => setSrc(!thumb || src === thumb ? null : thumb)}
        style={{ transform: `translate(${shown.x}px, ${shown.y}px) scale(${view.scale})` }}
        className={cn(
          "max-h-full max-w-full select-none object-contain",
          // The photo follows a finger without lag, and springs back when let go.
          !drag && "transition-transform duration-base motion-reduce:transition-none",
        )}
      />
      {!coarse && (
        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-md bg-photo-scrim p-0.5">
          <ZoomButton label="Zoom out" disabled={view.scale <= MIN_ZOOM} onPress={() => zoomTo(view.scale / ZOOM_STEP)}>
            <Minus className="size-4" aria-hidden="true" />
          </ZoomButton>
          <span className="min-w-12 text-center text-micro tabular-nums text-on-photo" aria-live="polite">
            {Math.round(view.scale * 100)}%
          </span>
          <ZoomButton label="Zoom in" disabled={view.scale >= MAX_ZOOM} onPress={() => zoomTo(view.scale * ZOOM_STEP)}>
            <Plus className="size-4" aria-hidden="true" />
          </ZoomButton>
        </div>
      )}
    </div>
  );
}

function ZoomButton({ label, disabled, onPress, children }: { label: string; disabled: boolean; onPress: () => void; children: ReactNode }) {
  return (
    <AriaButton
      aria-label={label}
      isDisabled={disabled}
      onPress={onPress}
      className="flex size-8 items-center justify-center rounded-md text-on-photo/80 transition-colors hover:bg-on-photo/10 hover:text-on-photo focus-visible:outline-on-photo disabled:opacity-50"
    >
      {children}
    </AriaButton>
  );
}

/**
 * Opening items in the viewer from a link and back (uploads 2.6, G1D-003):
 * opening one pushes `?file=<id>`, so the browser's Back closes the viewer and
 * a pasted link opens straight to that file; stepping replaces it, so Back
 * doesn't walk through every photo. With `enabled` false the viewer is plain
 * local state (a strip in a comment, a row with a mouse that opened nothing).
 * Only the record's own list turns it on (MediaGrid `link`, once per page).
 * Two lists that hold the same photo and both read `?file=` would open two
 * viewers on top of each other, each making the other inert, so the Activity
 * and update grids stay local.
 *
 *   const viewer = useViewerLink(items, true);
 *   <Lightbox items={items} index={viewer.index} onIndexChange={viewer.setIndex} isOpen={viewer.isOpen} onOpenChange={viewer.onOpenChange} />
 *   <Tile onOpen={() => viewer.openAt(i)} />
 */
export function useViewerLink(items: readonly { id: string }[], enabled: boolean) {
  const params = useSearchParams();
  const wanted = enabled ? params.get("file") : null;
  const fromUrl = wanted === null ? -1 : items.findIndex((it) => it.id === wanted);
  const [local, setLocal] = useState<{ open: boolean; index: number }>({ open: false, index: 0 });
  // The index it was last at, kept after closing so the fade-out still shows the item that was open.
  const [last, setLast] = useState(0);
  const pushed = useRef(false);

  const isOpen = enabled ? fromUrl >= 0 : local.open;
  const index = enabled ? (fromUrl >= 0 ? fromUrl : last) : local.index;

  const urlWith = useCallback((id: string | null) => {
    const u = new URL(window.location.href);
    if (id === null) u.searchParams.delete("file");
    else u.searchParams.set("file", id);
    return `${u.pathname}${u.search}${u.hash}`;
  }, []);

  const openAt = useCallback(
    (i: number) => {
      const target = items[i];
      if (!target) return;
      setLast(i);
      if (!enabled) return setLocal({ open: true, index: i });
      window.history.pushState(null, "", urlWith(target.id));
      pushed.current = true;
    },
    [enabled, items, urlWith],
  );

  const setIndex = useCallback(
    (i: number) => {
      const target = items[i];
      if (!target) return;
      setLast(i);
      if (!enabled) return setLocal((l) => ({ ...l, index: i }));
      window.history.replaceState(null, "", urlWith(target.id));
    },
    [enabled, items, urlWith],
  );

  const close = useCallback(() => {
    if (!enabled) return setLocal((l) => ({ ...l, open: false }));
    // Opened by this page: Back is the way out. Opened by a pasted link: there is nothing behind it to go back to.
    if (pushed.current) {
      pushed.current = false;
      window.history.back();
    } else window.history.replaceState(null, "", urlWith(null));
  }, [enabled, urlWith]);

  const onOpenChange = useCallback((open: boolean) => (open ? undefined : close()), [close]);

  return useMemo(() => ({ isOpen, index, openAt, setIndex, close, onOpenChange }), [isOpen, index, openAt, setIndex, close, onOpenChange]);
}
