"use client";
import { useLayoutEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { Camera, FileText, ImagePlus, Lock, Play, X } from "lucide-react";
import { MediaUploadTray, useMediaUploader } from "@/components/media-uploader";
import { SegmentedControl } from "@/components/segmented-control";
import { useToast, useToastInset } from "@/components/toast";
import { Button } from "@/components/ui";
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

/* ---------------- Composer ---------------- */

/** A file that's uploaded and waiting to go out with the message. */
export type ComposerDraft = { id: string; filename: string };

/**
 * Reply on a task: text, photos and videos, documents. Shared by default
 * (D15); on the job of a contractor with a login the Shared side reads
 * "Reply to Zack", and Internal turns the box amber. Files upload as
 * they're picked or dropped and go out with the message; Send waits for
 * them. Until Send they're Internal whichever side is picked
 * (core.addComment gives them the message's visibility), and the page hands
 * back any left from an earlier visit as `drafts`. Cmd or Ctrl+Enter sends.
 * On a phone it sits on the bottom edge, and its tools show while you write.
 */
export function Composer({
  taskId,
  contractorFirstName,
  staffNames,
  drafts,
}: {
  taskId: string;
  /** Set when the assigned contractor has a portal login, so a reply reaches them (G2B-I03). */
  contractorFirstName: string | null;
  /** "Connor and Pieter": who sees an Internal note. */
  staffNames: string;
  /** My uploads on this task not yet sent with a message, oldest first. */
  drafts: ComposerDraft[];
}) {
  const { toast } = useToast();
  const text = useSyncExternalStore(
    subscribe,
    () => readDraft(taskId),
    () => "",
  );
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
    <Button type="button" size="sm" disabled={!canSend} onClick={send} className={className}>
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
        "md:rounded-xl md:shadow-sm",
        // Opaque in dark mode too: on a phone it sits over the page.
        internal
          ? "border-amber-300 bg-amber-50 dark:border-amber-900/70 dark:bg-[color-mix(in_oklab,var(--color-amber-950)_45%,var(--surface))]"
          : "border-border bg-surface",
        // Same drop cue as the Attachments box.
        dragging && "border-primary dark:border-primary",
      )}
    >
      {uploader.inputs}
      {internal && (
        <p className="flex items-center gap-1.5 px-3 pt-2 text-xs font-medium text-amber-800 dark:text-amber-300">
          <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />
          Only {staffNames} see this
        </p>
      )}
      {ready.length > 0 && (
        <ul className="flex flex-wrap gap-2 px-3 pt-2.5">
          {ready.map((r) => (
            <ReadyTile key={r.id} item={r} onRemove={() => unready(r)} />
          ))}
        </ul>
      )}
      <MediaUploadTray uploader={uploader} className="px-3 pt-2.5" />
      <div className="flex items-end gap-1 px-1.5 py-1.5 md:px-2">
        <IconButton label="Take photo or video" onPress={uploader.takePhoto} className="pointer-fine:hidden">
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
          className="max-h-48 min-h-9 flex-1 resize-none bg-transparent px-1.5 py-2 text-sm leading-5 outline-none placeholder:text-muted md:min-h-12 md:px-1"
        />
        {sendButton("mb-0.5 md:hidden")}
      </div>
      {/* Pressing a tool keeps focus in the text box, so on a phone the row
          (shown while it has focus) doesn't vanish mid-tap. Keyboard focus
          still reaches each control. */}
      <div
        onMouseDown={(e) => e.preventDefault()}
        className="hidden items-center gap-1 px-1.5 pb-1.5 group-data-[active]/composer:flex group-focus-within/composer:flex md:flex md:px-2 md:pb-2"
      >
        <IconButton label="Add photos, videos or files" onPress={uploader.chooseFiles}>
          <ImagePlus />
        </IconButton>
        <SegmentedControl
          aria-label="Who sees this"
          className="ml-auto"
          value={visibility}
          onChange={setVisibility}
          options={[
            { key: "SHARED", label: contractorFirstName ? `Reply to ${contractorFirstName}` : "Shared" },
            { key: "INTERNAL", label: "Internal" },
          ]}
        />
        {sendButton("hidden md:inline-flex")}
      </div>
    </div>
  );
}

function IconButton({
  label,
  onPress,
  className,
  children,
}: {
  label: string;
  onPress: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onPress}
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted outline-none transition-colors hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/30 pointer-coarse:h-11 pointer-coarse:w-11 [&_svg]:h-[18px] [&_svg]:w-[18px]",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** A file that's uploaded and waiting to go out with the message. */
function ReadyTile({ item, onRemove }: { item: ComposerDraft; onRemove: () => void }) {
  const kind = fileKindForType(uploadContentType(item.filename, ""));
  return (
    <li className="relative h-14 w-14 shrink-0 rounded-lg bg-zinc-100 dark:bg-zinc-800" title={item.filename}>
      <div className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-lg ring-1 ring-inset ring-black/5 dark:ring-white/10">
        {kind === "image" ? (
          // Gated, session-checked route; next/image would cache it publicly.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={taskFileUrl(item.id)} alt="" className="h-full w-full object-cover" />
        ) : kind === "video" ? (
          <span className="flex h-full w-full items-center justify-center bg-zinc-900">
            <Play className="h-4 w-4 fill-white text-white" aria-hidden="true" />
          </span>
        ) : (
          <FileText className="h-5 w-5 text-muted" aria-hidden="true" />
        )}
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${item.filename}`}
        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-900 text-white shadow outline-none ring-2 ring-surface after:absolute after:-inset-3 focus-visible:ring-primary dark:bg-zinc-700 pointer-fine:after:-inset-1"
      >
        <X className="h-3 w-3" aria-hidden="true" />
      </button>
    </li>
  );
}
