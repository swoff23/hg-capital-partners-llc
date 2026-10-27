"use client";
import { useLayoutEffect, useRef, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { Camera, FileText, ImagePlus, Lock, Play, X } from "lucide-react";
import { MediaUploadTray, useMediaUploader, type MediaUploaderApi, type MediaUploaderOptions } from "@/components/media-uploader";
import { SegmentedControl } from "@/components/segmented-control";
import { useToast, useToastInset } from "@/components/toast";
import { Button, Kbd, buttonClass } from "@/components/ui";
import { shortcutLabel, useModKey } from "@/components/use-platform";
import { callAction, type ActionResult } from "@/lib/action-result";
import { fileKindForType, uploadContentType } from "@/lib/attachments/content-types";
import { cn } from "@/lib/utils";

/*
 * The one composer (docs/specs/activity-comments.md 2.7): the staff task page
 * (through the thin wrapper in app/(app)/tasks/[id]/composer.tsx), the
 * contractor's job page and the deal page's note box. Each caller owns its
 * wiring: what Send posts (`onSend`), the uploads and the audience copy.
 */

export type ComposerVisibility = "SHARED" | "INTERNAL";

/** What Send hands the caller. */
export interface ComposerMessage {
  body: string;
  /** "SHARED" whenever the composer has no switch. */
  visibility: ComposerVisibility;
  /** Ready files going out with it, oldest first. */
  attachmentIds: string[];
  /**
   * Made in the browser for this send, so a Retry of a send that did post
   * never posts twice (activity 2.7, `TaskEvent.data.clientId`). A caller
   * passes it on once its action takes it.
   */
  clientId: string;
}

/** A file that's uploaded and waiting to go out with the message. */
export type ComposerDraft = { id: string; filename: string };

/** The composer's uploads: where files go, the ones already waiting, how one is taken back. */
export interface ComposerUploader {
  /** The upload kind, row and record step, as useMediaUploader takes them. */
  options: MediaUploaderOptions;
  /** Files uploaded on an earlier visit and not sent yet, oldest first. */
  drafts: readonly ComposerDraft[];
  /** Takes a ready file back before it's sent. */
  remove: (draft: ComposerDraft) => Promise<ActionResult<unknown>>;
  /** The gated URL a ready photo's tile shows. */
  fileUrl: (id: string) => string;
}

export interface ComposerProps {
  /**
   * Where the draft lives in this browser, one key per surface and record,
   * so a staff draft never opens in the portal's composer on the same
   * origin ("hgos-task-draft:<taskId>" on the task page).
   */
  draftKey: string;
  /**
   * Who will see it, as one line over the field for each side of the switch
   * ("Zack sees this and gets an email"; "Only Connor and Pieter see this",
   * shown with the Lock). None for the deal note box.
   */
  audience?: { shared?: ReactNode; internal?: ReactNode } | null;
  /** "switch": Shared | Internal before Send. "none": always Shared (the portal) or no audience (deal notes). */
  visibility?: "switch" | "none";
  /** Photos, videos and files; none for the deal note box. */
  uploader?: ComposerUploader | null;
  /** Posts the message; the draft and the files stay until it answers ok. */
  onSend: (message: ComposerMessage) => Promise<ActionResult<unknown>>;
  /** "phone": below md the composer sits on the bottom edge. "never": inline at every size. */
  pin?: "phone" | "never";
  /** Placeholder per side: "Reply to Zack" or "Add a comment"; "Add an internal note". */
  placeholders: { shared: string; internal?: string };
  /** Send's label per side: "Send"; "Add note" for an Internal note or a deal note. */
  sendLabel?: { shared?: string; internal?: string };
}

/* ---------------- Draft, kept per key in this browser ---------------- */

// Read through useSyncExternalStore so the server render and hydration see
// an empty box and the saved draft appears right after. Memory backs it up
// when storage is off (private windows).
const drafts = new Map<string, string>();
const listeners = new Set<() => void>();

function readDraft(key: string): string {
  if (!drafts.has(key)) {
    let saved = "";
    try {
      saved = localStorage.getItem(key) ?? "";
    } catch {}
    drafts.set(key, saved);
  }
  return drafts.get(key) ?? "";
}

function writeDraft(key: string, text: string) {
  drafts.set(key, text);
  try {
    if (text) localStorage.setItem(key, text);
    else localStorage.removeItem(key);
  } catch {}
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

function newClientId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  }
}

/* ---------------- Composer ---------------- */

/**
 * Write a reply, a note or an update: text, and with an uploader photos,
 * videos and documents. Files upload as they're picked, dropped or pasted
 * and go out with the message; Send waits for them. Cmd or Ctrl+Enter
 * sends, printed inside Send at its trailing edge for a mouse ("Send ⌘↵").
 * With the switch, Internal turns the box --fill-1 under a Lock line
 * (docs/brand-guidelines.md, section 9). Pinned on a phone, it sits on the
 * bottom edge with its contents on the 16px page gutter, and its tools show
 * while you write. Send is secondary, so it never competes with a page's one
 * primary (the Review banner's Approve, a deal's stage).
 */
export function Composer(props: ComposerProps) {
  if (props.uploader) return <UploadingComposer {...props} uploader={props.uploader} />;
  return <ComposerBody {...props} uploader={null} api={null} added={NONE} />;
}

const NONE: readonly ComposerDraft[] = [];

/** With uploads: the uploader's hook lives here, so a composer without one never starts it. */
function UploadingComposer(props: ComposerProps & { uploader: ComposerUploader }) {
  // Recorded here but not yet in `drafts` (the page catches up after the refresh).
  const [added, setAdded] = useState<ComposerDraft[]>([]);
  const { options } = props.uploader;
  const api = useMediaUploader({
    ...options,
    record: async (file) => {
      const res = await options.record(file);
      if (res.ok && res.data) {
        const recorded = { id: res.data.id, filename: file.filename };
        setAdded((r) => [...r, recorded]);
      }
      return res;
    },
  });
  return <ComposerBody {...props} api={api} added={added} />;
}

function ComposerBody({
  draftKey,
  audience,
  visibility: mode = "switch",
  uploader,
  onSend,
  pin = "phone",
  placeholders,
  sendLabel,
  api,
  added,
}: ComposerProps & {
  uploader: ComposerUploader | null;
  api: MediaUploaderApi | null;
  added: readonly ComposerDraft[];
}) {
  const { toast } = useToast();
  const text = useSyncExternalStore(
    subscribe,
    () => readDraft(draftKey),
    () => "",
  );
  const mod = useModKey();
  const [visibility, setVisibility] = useState<ComposerVisibility>("SHARED");
  // Ids sent or removed, which a stale `drafts` mustn't bring back.
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set());
  const waiting = uploader?.drafts ?? [];
  const ready = [...waiting, ...added.filter((a) => !waiting.some((d) => d.id === a.id))].filter((r) => !gone.has(r.id));
  const forget = (ids: string[]) => setGone((g) => new Set([...g, ...ids]));
  const [dragging, setDragging] = useState(false);
  const [sending, startSend] = useTransition();
  const field = useRef<HTMLTextAreaElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const internal = mode === "switch" && visibility === "INTERNAL";
  const pinned = pin === "phone";

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

  const pendingUploads = api?.pending ?? 0;
  const canSend = !sending && pendingUploads === 0 && (text.trim().length > 0 || ready.length > 0);

  function send() {
    if (!canSend) return;
    const message: ComposerMessage = {
      body: text,
      visibility: internal ? "INTERNAL" : "SHARED",
      attachmentIds: ready.map((r) => r.id),
      clientId: newClientId(),
    };
    startSend(async () => {
      // The draft and the files stay until it's sent, so a failure loses nothing.
      const res = await callAction(() => onSend(message));
      if (!res.ok) {
        toast({ message: res.error });
        return;
      }
      writeDraft(draftKey, "");
      forget(message.attachmentIds);
    });
  }

  function unready(r: ComposerDraft) {
    if (!uploader) return;
    forget([r.id]);
    void callAction(() => uploader.remove(r)).then((res) => {
      if (!res.ok) toast({ message: `Couldn't remove ${r.filename}.` });
    });
  }

  const hasFiles = (e: React.DragEvent) => !!api && e.dataTransfer.types.includes("Files");

  const placeholder = internal ? (placeholders.internal ?? placeholders.shared) : placeholders.shared;
  const label = internal ? (sendLabel?.internal ?? "Send") : (sendLabel?.shared ?? "Send");
  const audienceLine = internal ? audience?.internal : audience?.shared;
  // Internal stays open too, so the switch back is never hidden.
  const active = text.length > 0 || ready.length > 0 || (api?.uploads.length ?? 0) > 0 || internal;
  // The tools row holds the switch and the file button; without either it has nothing to show.
  const tools = mode === "switch" || !!api;

  // The keys that send from the text box sit inside the button, at its trailing edge, for a mouse: Kbd
  // hides on touch, and here below md and in a narrow column, so Send is just its word there. The button
  // carries the shortcut for assistive tech; the printed keys stay out of its name.
  const sendButton = (className: string) => (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      disabled={!canSend}
      onClick={send}
      aria-keyshortcuts="Meta+Enter Control+Enter"
      className={className}
    >
      {sending ? "Sending…" : label}
      <Kbd aria-hidden="true" className="max-md:hidden @max-md/composer:hidden">
        {shortcutLabel(mod, "↵")}
      </Kbd>
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
        api?.addFiles(e.dataTransfer.files);
      }}
      className={cn(
        // A container, so the tools row can drop the keycap when the column is narrow (lg with the sidebar pinned).
        "group/composer @container/composer border transition-colors print:hidden",
        pinned
          ? "max-md:sticky max-md:bottom-0 max-md:z-20 max-md:-mx-4 max-md:-mb-4 max-md:border-x-0 max-md:border-b-0 max-md:pb-[env(safe-area-inset-bottom)] md:rounded-lg"
          : "rounded-lg",
        // Both grounds are opaque: on a phone it sits over the page.
        internal ? "border-line bg-fill-1" : "border-line bg-surface",
        // Same drop cue as the Attachments box.
        dragging && "border-act",
      )}
    >
      {api?.inputs}
      {audienceLine &&
        (internal ? (
          <p className="flex items-center gap-1.5 px-4 pt-2 text-meta font-medium text-fg-2 md:px-3">
            <Lock className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 truncate">{audienceLine}</span>
          </p>
        ) : (
          <p className="truncate px-4 pt-2 text-meta text-fg-3 md:px-3">{audienceLine}</p>
        ))}
      {uploader && ready.length > 0 && (
        <ul className="flex flex-wrap gap-2 px-4 pt-2.5 md:px-3">
          {ready.map((r) => (
            <ReadyTile key={r.id} item={r} url={uploader.fileUrl(r.id)} onRemove={() => unready(r)} />
          ))}
        </ul>
      )}
      {api && <MediaUploadTray uploader={api} className="px-4 pt-2.5 md:px-3" />}
      {/* On a phone Send ends on the 16px gutter, under the chips and rules above it. */}
      <div className={cn("flex items-end gap-1 py-1.5 pl-1.5 pr-4 md:px-2", !api && "pl-2.5")}>
        {api && (
          <IconButton label="Take photo or video" onPress={api.takePhoto} onFill={internal} className="pointer-fine:hidden">
            <Camera />
          </IconButton>
        )}
        <textarea
          ref={field}
          aria-label={internal ? "Internal note" : placeholders.shared}
          rows={1}
          value={text}
          placeholder={placeholder}
          onChange={(e) => writeDraft(draftKey, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            }
          }}
          onPaste={(e) => {
            if (api && e.clipboardData.files.length > 0) {
              e.preventDefault();
              api.addFiles(e.clipboardData.files);
            }
          }}
          className="max-h-48 min-h-9 flex-1 resize-none bg-transparent px-1.5 py-2 text-body text-fg-1 outline-none placeholder:text-fg-3 md:min-h-12 md:px-1"
        />
        {sendButton(cn("mb-0.5", tools && "md:hidden"))}
      </div>
      {/* Pressing a tool keeps focus in the text box, so on a phone the row
          (shown while it has focus) doesn't vanish mid-tap. Keyboard focus
          still reaches each control. */}
      {tools && (
        <div
          onMouseDown={(e) => e.preventDefault()}
          className="hidden items-center gap-1 pb-1.5 pl-1.5 pr-4 group-data-[active]/composer:flex group-focus-within/composer:flex md:flex md:px-2 md:pb-2"
        >
          {api && (
            <IconButton label="Add photos, videos or files" onPress={api.chooseFiles} onFill={internal}>
              <ImagePlus />
            </IconButton>
          )}
          {mode === "switch" && (
            <SegmentedControl
              aria-label="Who sees this"
              // On the internal note's --fill-1 ground the track steps up to --fill-2, or it vanishes.
              className={cn("ml-auto", internal && "bg-fill-2")}
              value={visibility}
              onChange={setVisibility}
              options={[
                { key: "SHARED", label: "Shared" },
                { key: "INTERNAL", label: "Internal" },
              ]}
            />
          )}
          {sendButton(cn("hidden md:inline-flex", mode !== "switch" && "ml-auto"))}
        </div>
      )}
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
        "shrink-0 text-fg-3 [&_svg]:size-4.5",
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
function ReadyTile({ item, url, onRemove }: { item: ComposerDraft; url: string; onRemove: () => void }) {
  const kind = fileKindForType(uploadContentType(item.filename, ""));
  return (
    <li className="relative h-14 w-14 shrink-0 rounded-lg bg-fill-1" title={item.filename}>
      <div className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-lg">
        {kind === "image" ? (
          // Gated, session-checked route; next/image would cache it publicly.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="h-full w-full object-cover" />
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
