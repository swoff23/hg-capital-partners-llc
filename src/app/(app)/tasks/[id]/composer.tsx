"use client";
import { useLayoutEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { Camera, FileText, ImagePlus, Lock, Play, X } from "lucide-react";
import { MediaUploadTray, useMediaUploader } from "@/components/media-uploader";
import { SegmentedControl } from "@/components/segmented-control";
import { useToast, useToastInset } from "@/components/toast";
import { Button, Kbd, buttonClass } from "@/components/ui";
import { callAction } from "@/lib/action-result";
import { fileKindForType, uploadContentType } from "@/lib/attachments/content-types";
import { taskFileUrl } from "@/lib/attachments/media";
import { cn } from "@/lib/utils";
import { recordTaskAttachment } from "../actions";
import { addTaskComment, deleteTaskFile } from "./actions";

type Visibility = "SHARED" | "INTERNAL";

/* ---------------- Draft, kept per task in this browser ---------------- */

// Read through useSyncExternalStore so the server render and hydration see
// an empty box and the saved draft appears right after. Memory backs it up
// when storage is off (private windows).
const drafts = new Map<string, string>();
const listeners = new Set<() => void>();
const draftKey = (taskId: string) => `hgos-task-draft:${taskId}`;

function readDraft(taskId: string): string {
  if (!drafts.has(taskId)) {
    let saved = "";
    try {
      saved = localStorage.getItem(draftKey(taskId)) ?? "";
    } catch {}
    drafts.set(taskId, saved);
  }
  return drafts.get(taskId) ?? "";
}

function writeDraft(taskId: string, text: string) {
  drafts.set(taskId, text);
  try {
    if (text) localStorage.setItem(draftKey(taskId), text);
    else localStorage.removeItem(draftKey(taskId));
  } catch {}
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/* ---------------- The send keys ---------------- */

// Apple keyboards print ⌘ for the key that sends; everyone else presses Ctrl.
// The server render prints ⌘ and the client corrects it after hydration.
const neverChanges = () => () => {};
const onApple = () => /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);

/* ---------------- Composer ---------------- */

/** A file that's uploaded and waiting to go out with the message. */
export type ComposerDraft = { id: string; filename: string };

/**
 * Reply on a task: text, photos and videos, documents. Shared by default
 * (D15); on the job of a contractor with a login the Shared side reads
 * "Reply to Zack", and Internal turns the box --fill-1 under a Lock line
 * (docs/brand-guidelines.md, section 9). Files upload as they're picked or
 * dropped and go out with the message; Send waits for them. Until Send
 * they're Internal whichever side is picked (core.addComment gives them the
 * message's visibility), and the page hands back any left from an earlier
 * visit as `drafts`. Cmd or Ctrl+Enter sends, printed beside Send for a
 * mouse. On a phone it sits on the bottom edge, its contents on the 16px
 * page gutter, and its tools show while you write. `quietSend` makes Send
 * secondary while the Review banner's Approve is the page's next step.
 */
export function Composer({
  taskId,
  contractorFirstName,
  staffNames,
  drafts,
  quietSend = false,
}: {
  taskId: string;
  /** Set when the assigned contractor has a portal login, so a reply reaches them (G2B-I03). */
  contractorFirstName: string | null;
  /** "Connor and Pieter": who sees an Internal note. */
  staffNames: string;
  /** My uploads on this task not yet sent with a message, oldest first. */
  drafts: ComposerDraft[];
  /** Send as a secondary button, so it never competes with Approve. */
  quietSend?: boolean;
}) {
  const { toast } = useToast();
  const text = useSyncExternalStore(
    subscribe,
    () => readDraft(taskId),
    () => "",
  );
  const apple = useSyncExternalStore(neverChanges, onApple, () => true);
  const [visibility, setVisibility] = useState<Visibility>("SHARED");
  // Recorded here but not yet in `drafts` (the page catches up after the
  // refresh), and ids sent or removed, which a stale `drafts` mustn't bring back.
  const [added, setAdded] = useState<ComposerDraft[]>([]);
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set());
  const ready = [...drafts, ...added.filter((a) => !drafts.some((d) => d.id === a.id))].filter((r) => !gone.has(r.id));
  const forget = (ids: string[]) => setGone((g) => new Set([...g, ...ids]));
  const [dragging, setDragging] = useState(false);
  const [sending, startSend] = useTransition();
  const field = useRef<HTMLTextAreaElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const internal = visibility === "INTERNAL";

  const uploader = useMediaUploader({
    taskId,
    uploadKind: "task-upload",
    allowed: ["image", "video", "file"],
    record: async (file) => {
      // Internal until Send, so a contractor can't open it while it waits.
      const res = await recordTaskAttachment(taskId, { ...file, visibility: "INTERNAL", standalone: false });
      if (res.ok) setAdded((r) => [...r, { id: res.data.id, filename: file.filename }]);
      return res;
    },
  });

  // Grow with the text, up to the cap in CSS.
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  // On a phone the composer is pinned to the bottom edge: lift toasts above it.
  const [inset, setInset] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setInset(getComputedStyle(el).position === "sticky" ? el.offsetHeight : 0);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useToastInset(inset);

  const canSend = !sending && uploader.pending === 0 && (text.trim().length > 0 || ready.length > 0);

  function send() {
    if (!canSend) return;
    const body = text;
    const attachmentIds = ready.map((r) => r.id);
    startSend(async () => {
      // The draft and the files stay until it's sent, so a failure loses nothing.
      const res = await callAction(() => addTaskComment(taskId, { body, visibility, attachmentIds }));
      if (!res.ok) {
        toast({ message: res.error });
        return;
      }
      writeDraft(taskId, "");
      forget(attachmentIds);
    });
  }

  function unready(r: ComposerDraft) {
    forget([r.id]);
    void callAction(() => deleteTaskFile(r.id)).then((res) => {
      if (!res.ok) toast({ message: `Couldn't remove ${r.filename}.` });
    });
  }

  const hasFiles = (e: React.DragEvent) => e.dataTransfer.types.includes("Files");

  const placeholder = internal
    ? "Add an internal note"
    : contractorFirstName
      ? `Reply to ${contractorFirstName}`
      : "Add a comment";
  // Internal stays open too, so the switch back is never hidden.
  const active = text.length > 0 || ready.length > 0 || uploader.uploads.length > 0 || internal;

  const sendButton = (className: string) => (
    <Button type="button" variant={quietSend ? "secondary" : "primary"} size="sm" disabled={!canSend} onClick={send} className={className}>
      {sending ? "Sending…" : "Send"}
    </Button>
  );

  return (
    <div
      ref={box}
      data-active={active || undefined}
      onDragOver={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        setDragging(false);
        uploader.addFiles(e.dataTransfer.files);
      }}
      className={cn(
        "group/composer border transition-colors",
        "max-md:sticky max-md:bottom-0 max-md:z-20 max-md:-mx-4 max-md:-mb-4 max-md:border-x-0 max-md:border-b-0 max-md:pb-[env(safe-area-inset-bottom)]",
        // Flat, like every field and bar: an edge, no shadow.
        "md:rounded-lg",
        // Both grounds are opaque: on a phone it sits over the page.
        internal ? "border-line bg-fill-1" : "border-line bg-surface",
        // Same drop cue as the Attachments box.
        dragging && "border-act",
      )}
    >
      {uploader.inputs}
      {internal && (
        <p className="flex items-center gap-1.5 px-4 pt-2 text-meta font-medium text-fg-2 md:px-3">
          <Lock className="size-3.5 shrink-0" aria-hidden="true" />
          Only {staffNames} see this
        </p>
      )}
      {ready.length > 0 && (
        <ul className="flex flex-wrap gap-2 px-4 pt-2.5 md:px-3">
          {ready.map((r) => (
            <ReadyTile key={r.id} item={r} onRemove={() => unready(r)} />
          ))}
        </ul>
      )}
      <MediaUploadTray uploader={uploader} className="px-4 pt-2.5 md:px-3" />
      {/* On a phone Send ends on the 16px gutter, under the chips and rules above it. */}
      <div className="flex items-end gap-1 py-1.5 pl-1.5 pr-4 md:px-2">
        <IconButton label="Take photo or video" onPress={uploader.takePhoto} onFill={internal} className="pointer-fine:hidden">
          <Camera />
        </IconButton>
        <textarea
          ref={field}
          aria-label={internal ? "Internal note" : "Comment"}
          rows={1}
          value={text}
          placeholder={placeholder}
          onChange={(e) => writeDraft(taskId, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            }
          }}
          onPaste={(e) => {
            if (e.clipboardData.files.length > 0) {
              e.preventDefault();
              uploader.addFiles(e.clipboardData.files);
            }
          }}
          className="max-h-48 min-h-9 flex-1 resize-none bg-transparent px-1.5 py-2 text-body text-fg-1 outline-none placeholder:text-fg-3 md:min-h-12 md:px-1"
        />
        {sendButton("mb-0.5 md:hidden")}
      </div>
      {/* Pressing a tool keeps focus in the text box, so on a phone the row
          (shown while it has focus) doesn't vanish mid-tap. Keyboard focus
          still reaches each control. */}
      <div
        onMouseDown={(e) => e.preventDefault()}
        className="hidden items-center gap-1 pb-1.5 pl-1.5 pr-4 group-data-[active]/composer:flex group-focus-within/composer:flex md:flex md:px-2 md:pb-2"
      >
        <IconButton label="Add photos, videos or files" onPress={uploader.chooseFiles} onFill={internal}>
          <ImagePlus />
        </IconButton>
        <SegmentedControl
          aria-label="Who sees this"
          // On the internal note's --fill-1 ground the track steps up to --fill-2, or it vanishes.
          className={cn("ml-auto", internal && "bg-fill-2")}
          value={visibility}
          onChange={setVisibility}
          options={[
            { key: "SHARED", label: contractorFirstName ? `Reply to ${contractorFirstName}` : "Shared" },
            { key: "INTERNAL", label: "Internal" },
          ]}
        />
        {/* The keys that send from the text box, printed for a mouse; Kbd hides on touch. */}
        <Kbd aria-hidden="true" className="ml-1 max-md:hidden">
          {apple ? "⌘↵" : "Ctrl ↵"}
        </Kbd>
        {sendButton("hidden md:inline-flex")}
      </div>
    </div>
  );
}

function IconButton({
  label,
  onPress,
  onFill = false,
  className,
  children,
}: {
  label: string;
  onPress: () => void;
  /** On the internal note's --fill-1 ground, where the ghost hover would vanish: it steps up to --fill-2. */
  onFill?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onPress}
      // A ghost icon button with its icon idle in --fg-3, --fg-1 on hover.
      className={cn(
        buttonClass({ variant: "ghost", icon: true }),
        "text-fg-3 [&_svg]:size-4.5",
        onFill && "not-disabled:hover:bg-fill-2",
        className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * A file that's uploaded and waiting to go out with the message. The same
 * 56px tile as the upload tray's (components/media-uploader.tsx): --fill-1
 * under the photo, the photo edge on top, an ink Remove badge.
 */
function ReadyTile({ item, onRemove }: { item: ComposerDraft; onRemove: () => void }) {
  const kind = fileKindForType(uploadContentType(item.filename, ""));
  return (
    <li className="relative h-14 w-14 shrink-0 rounded-lg bg-fill-1" title={item.filename}>
      <div className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-lg">
        {kind === "image" ? (
          // Gated, session-checked route; next/image would cache it publicly.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={taskFileUrl(item.id)} alt="" className="h-full w-full object-cover" />
        ) : kind === "video" ? (
          <span className="flex h-full w-full items-center justify-center bg-photo-stage">
            <Play className="size-4 fill-on-photo text-on-photo" aria-hidden="true" />
          </span>
        ) : (
          <FileText className="size-5 text-fg-3" aria-hidden="true" />
        )}
        <div className="pointer-events-none absolute inset-0 rounded-lg inset-shadow-photo-edge" />
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${item.filename}`}
        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-act text-on-act ring-2 ring-surface after:absolute after:-inset-3 pointer-fine:after:-inset-1"
      >
        <X className="size-3" aria-hidden="true" />
      </button>
    </li>
  );
}
