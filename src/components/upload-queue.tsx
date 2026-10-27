"use client";
import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { useHoldLeave } from "@/components/leave-guard";
import { useToast } from "@/components/toast";
import { useLeaveWarning } from "@/components/use-leave-warning";
import { NO_COUNTS, UploadEngine, type EngineDeps, type EngineNotice } from "@/lib/attachments/engine";
import { idbOutbox } from "@/lib/attachments/outbox";
import { sendBlob } from "@/lib/attachments/transfer";
import type { FileKind } from "@/lib/attachments/content-types";
import type { UploadKind } from "@/lib/attachments/upload-kinds";
import { stillUploading } from "@/lib/portal/job-view";
import type { RecordMediaInput, RecordMediaResult } from "@/components/media-uploader";

/**
 * One upload queue for the app and the portal (docs/specs/uploads-photos.md
 * 2.1 and 2.2): every surface hands its files to the queue under a target,
 * and the queue checks, prepares and uploads them whether or not the page
 * that started them is still open. Mounted once in each layout,
 * src/app/(app)/layout.tsx (inside AppShell, under the LeaveGuard) and
 * src/app/(portal)/p/layout.tsx, so it holds Sign out while files are going
 * up (build plan conflict 33; only Sign out, since the queue outlives the
 * page) and its toasts reach every page. The engine is
 * lib/attachments/engine.ts; this file is its React side and the window's
 * drop and paste targets.
 *
 *   const target: UploadTarget = { key: `task:${id}`, label: "56 Tamarack St", uploadKind: "task-upload", … };
 *   const { pending, waiting, failed, add } = useUploadQueue(target.key);
 *   const drop = useDropTarget(target, mainRef, { label: "Drop to add to this reply" });
 *
 * Most surfaces don't touch the queue directly: useMediaUploader (media-
 * uploader.tsx) gives them the tiles, the picker and the status line, and
 * sets the target. `useUploadQueue` is for what only needs the counts (a My
 * jobs row, the Sign out hold) or to add files from somewhere else.
 *
 * Files in flight survive the page: a target's tiles come back when its page
 * does. A batch that lands while its page is gone is held as drafts (staff:
 * "3 files ready to send", View) or handed to the target's `onAway` (a
 * contractor's update). The on-device outbox (outbox.ts) puts every file in
 * IndexedDB first, so a reload or a closed tab resumes on the next page.
 */

/** One place files land. The queue is keyed by `key`. */
export type UploadTarget = {
  /** "task:<id>", "portal-task:<id>", "property-doc:<id>", "listing:<id>", "property-photo:<id>" (uploadTargetKey). */
  key: string;
  /** "56 Tamarack St": for toasts and accessible names. */
  label: string;
  /** The /api/blob/[kind] token route (lib/attachments/upload-kinds.ts). */
  uploadKind: UploadKind;
  /** The row the token route checks: the task's id for task kinds, the property's for property kinds. */
  parentId: string;
  /** Listing and property photos are public; everything else is private. */
  access: "private" | "public";
  /** What this target accepts, from UPLOAD_KIND_ALLOWED. */
  allowed: readonly FileKind[];
  /**
   * How many more files this target takes: the room left (a listing: 20 minus
   * what it holds). Files in flight count against it as they are added; one
   * past it gets a refused tile.
   */
  maxFiles?: number;
  /** "display" re-encodes a photo to a 2560px JPEG with no metadata before it goes up; "original" sends it as picked. */
  prepare: "original" | "display";
  /** Writes the row once the bytes are up. The server checks the blob itself. */
  record: (file: RecordMediaInput) => Promise<RecordMediaResult>;
  /**
   * The new rows' ids each time a batch settles (everything in it has landed
   * or failed), while the page that set the target is mounted. A file that
   * failed and is retried later reports on its own.
   */
  onRecorded?: (ids: string[]) => void;
  /** Once the page is gone: "hold" keeps the files as drafts (staff replies), "post" hands a landed batch to `onAway`, which posts it (contractors). */
  whenAway: "hold" | "post";
  /** A batch landed with its page gone and `whenAway` is "post": post it as the target's own update. */
  onAway?: (ids: string[], info: { batchId: string; failed: number }) => void;
  /** Where View in "3 files ready to send" goes; the target's page by default (uploadTargetHref). */
  href?: string;
  /**
   * Send `queuedAt` to the record step in the file's input (the late-upload
   * rule, uploads question 4). Off unless the target's action takes the field;
   * the token request always carries it for a contractor's kind.
   */
  sendQueuedAt?: boolean;
};

/** What's in flight for one target, or for every target. */
export type UploadCounts = {
  /** Not recorded yet: queued, being prepared, going up or being saved. */
  pending: number;
  /** Held for a signal (the outbox): they retry on their own. */
  waiting: number;
  /** Refused or out of retries: each waits for a Retry or a Remove. */
  failed: number;
  /** The kinds of the pending and waiting files, for "3 photos are still uploading" (job-view stillUploading). */
  pendingKinds: readonly (FileKind | null)[];
};

export type UploadQueueView = UploadCounts & {
  /** Queues files for a target as one batch: one activity line and one confirmation. */
  add: (target: UploadTarget, files: FileList | readonly File[]) => void;
};

/** While a file is dragged over the window: every target lights up, and the one under the pointer shows its label. */
export type DropTargetState = {
  /** A file is being dragged anywhere over the window and this target accepts it. */
  active: boolean;
  /** The file is over this target: show its drop label. */
  over: boolean;
};

export type DropTargetOptions = {
  /** The drop label: "Drop to add to Documents", "Drop to add photos" (uploads 2.13). */
  label: string;
  /** Not accepting right now (the listing editor closed, a sending Mark done). */
  disabled?: boolean;
  /**
   * Where a pasted file goes when nothing is being typed in (Cmd or Ctrl+V
   * with files): the most recently set target that takes pastes. On by
   * default; the listing photos, set while their editor is open, win over the
   * page's Documents that way.
   */
  paste?: boolean;
};

/* ---------------- Drop targets ---------------- */

type DropEntry = {
  id: number;
  ref: RefObject<HTMLElement | null>;
  latest: { current: { target: UploadTarget; options: DropTargetOptions } };
};

const INACTIVE: DropTargetState = { active: false, over: false };
const ACTIVE: DropTargetState = { active: true, over: false };
const OVER: DropTargetState = { active: true, over: true };

/** Which targets are registered and where a drag is. */
class DropRegistry {
  private entries = new Map<number, DropEntry>();
  private listeners = new Set<() => void>();
  private dragging = false;
  private over: number | null = null;
  private seq = 0;

  nextId = () => ++this.seq;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  register(entry: DropEntry): () => void {
    this.entries.set(entry.id, entry);
    this.emit();
    return () => {
      this.entries.delete(entry.id);
      if (this.over === entry.id) this.over = null;
      this.emit();
    };
  }

  stateFor = (id: number): DropTargetState => {
    if (!this.dragging || !this.entries.has(id)) return INACTIVE;
    return this.over === id ? OVER : ACTIVE;
  };

  private emit() {
    for (const l of [...this.listeners]) l();
  }

  setDragging(dragging: boolean) {
    if (this.dragging === dragging && (dragging || this.over === null)) return;
    this.dragging = dragging;
    if (!dragging) this.over = null;
    this.emit();
  }

  setOver(id: number | null) {
    if (this.over === id) return;
    this.over = id;
    this.emit();
  }

  /** The target under an element: of those whose element holds it, the one registered last (the innermost, in practice). */
  entryAt(node: EventTarget | null): DropEntry | null {
    if (!(node instanceof Node)) return null;
    let found: DropEntry | null = null;
    for (const e of this.entries.values()) {
      if (e.latest.current.options.disabled) continue;
      if (e.ref.current?.contains(node) && (!found || e.id > found.id)) found = e;
    }
    return found;
  }

  /** Where a paste goes: the last registered target that takes pastes. */
  pasteEntry(): DropEntry | null {
    let found: DropEntry | null = null;
    for (const e of this.entries.values()) {
      const { options } = e.latest.current;
      if (options.disabled || options.paste === false) continue;
      if (!found || e.id > found.id) found = e;
    }
    return found;
  }
}

/* ---------------- The engine's browser dependencies ---------------- */

/**
 * Takes a Web Lock named for the file and holds it until the tab is gone or
 * the engine lets go (the file is recorded or removed), so a second tab, or a
 * reload in another one, never sends and records the same file twice. null
 * when another tab holds it. Where there are no Web Locks (or they throw), the
 * file is ours.
 */
function claimFile(id: string): Promise<(() => void) | null> {
  const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
  if (!locks) return Promise.resolve(() => {});
  return new Promise((resolve) => {
    let letGo: () => void = () => {};
    const held = new Promise<void>((done) => {
      letGo = done;
    });
    try {
      locks
        .request(`hg-upload:${id}`, { ifAvailable: true }, (lock) => {
          if (!lock) {
            resolve(null);
            return;
          }
          resolve(letGo);
          return held;
        })
        .catch(() => resolve(() => {}));
    } catch {
      resolve(() => {});
    }
  });
}

export function browserDeps(parts: {
  notify: (n: EngineNotice) => void;
  navigate: (href: string) => void;
  persist?: boolean;
  /** Whose queue: "app:<user id>" or "portal:<contact id>" (EngineDeps.scope). */
  scope?: string;
}): EngineDeps {
  return {
    scope: parts.scope,
    claim: parts.persist === false ? undefined : claimFile,
    transfer: sendBlob,
    outbox: parts.persist === false ? null : idbOutbox(),
    notify: parts.notify,
    navigate: parts.navigate,
    online: () => typeof navigator === "undefined" || navigator.onLine !== false,
    now: () => new Date(),
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout> | undefined),
    preview: {
      create: (blob) => {
        try {
          return URL.createObjectURL(blob);
        } catch {
          return null;
        }
      },
      revoke: (url) => URL.revokeObjectURL(url),
    },
    uid: () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`,
    // The browser may keep the outbox past its usual storage cleanup when asked (Safari clears a quiet site's storage after 7 days).
    persist: () => {
      try {
        void navigator.storage?.persist?.();
      } catch {
        /* a private window refuses */
      }
    },
  };
}

type QueueContextValue = { engine: UploadEngine; drops: DropRegistry };

const QueueContext = createContext<QueueContextValue | null>(null);

const noSubscribe = () => () => {};

/** The engine of the nearest UploadQueueProvider, for media-uploader.tsx; null outside one. */
export function useUploadEngine(): UploadEngine | null {
  return useContext(QueueContext)?.engine ?? null;
}

/**
 * The queue for everything under it. Mounted once per layout; a second one inside would split the counts.
 * `scope` says whose files it is: "app:<user id>" in the app, "portal:<contact id>" in the contractor portal. One browser
 * database serves both layouts and every person who signs in on it, so each queue picks up only its own.
 */
export function UploadQueueProvider({ children, scope }: { children: ReactNode; scope: string }) {
  const { toast } = useToast();
  const router = useRouter();
  const [value] = useState<QueueContextValue>(() => ({
    engine: new UploadEngine(browserDeps({ notify: () => {}, navigate: () => {}, scope })),
    drops: new DropRegistry(),
  }));
  const { engine, drops } = value;

  // The engine outlives renders, so it is handed the toast and the router as they are now.
  useEffect(() => {
    engine.setHandlers({
      notify: (n) =>
        toast({
          message: n.message,
          key: n.key,
          action: n.action && { label: n.action.label, onAction: n.action.run },
        }),
      navigate: (href) => router.push(href),
    });
  }, [engine, toast, router]);

  // Gone with its layout (Sign out, or the portal keying a new queue to whoever signed in): the engine stops, so
  // nothing it was sending records or posts under the next person's session, and its files wait in the outbox for
  // their own person (engine.dispose). A tick later, because Strict Mode in development unmounts and mounts every
  // effect once on purpose, and that rehearsal must not stop it.
  const stopping = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (stopping.current !== null) clearTimeout(stopping.current);
    stopping.current = null;
    return () => {
      stopping.current = setTimeout(() => engine.dispose(), 0);
    };
  }, [engine]);

  // Pick the outbox up, and try again when the signal or the tab comes back.
  useEffect(() => {
    void engine.restore();
    const wake = () => engine.nudge();
    const onVisible = () => {
      if (document.visibilityState === "visible") engine.nudge();
    };
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [engine]);

  // Sign out asks while anything is going up. Back links, tabs, the sidebar and search never do: the queue outlives the page.
  const all = useSyncExternalStore(engine.subscribe, () => engine.counts(), () => NO_COUNTS);
  const going = all.pending + all.waiting;
  useHoldLeave(going > 0 ? { title: stillUploading(all.pendingKinds), stay: "Keep uploading", scope: "sign-out" } : null);
  // Where the outbox can't keep a file (none, or a write that failed), a reload would lose it: browsers that honor it ask.
  const unsaved = useSyncExternalStore(engine.subscribe, engine.needsLeaveWarning, () => false);
  useLeaveWarning(unsaved);

  return (
    <QueueContext value={value}>
      {children}
      <WindowDropGuard engine={engine} drops={drops} />
    </QueueContext>
  );
}

/**
 * What the window does with a file dragged or pasted onto it (uploads 2.2).
 * It cancels the browser's default for `dragover` and `drop` everywhere, so a
 * stray drop never opens the file in the tab and throws the draft away
 * (G1D-008), and the cursor says no outside a target. Drag state counts
 * `dragenter` and `dragleave` on the window, not on each child, so it never
 * flickers (G1D-024). A drop runs the target's checks (the engine's add); a
 * paste with files, outside a text field, goes to the page's default target.
 * A page that handles a drop itself (calls preventDefault) is left alone.
 */
function WindowDropGuard({ engine, drops }: { engine: UploadEngine; drops: DropRegistry }) {
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      drops.setDragging(true);
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) drops.setDragging(false);
    };
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e) || e.defaultPrevented) return;
      const entry = drops.entryAt(e.target);
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = entry ? "copy" : "none";
      drops.setOver(entry?.id ?? null);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e) || e.defaultPrevented) {
        depth = 0;
        drops.setDragging(false);
        return;
      }
      e.preventDefault();
      const entry = drops.entryAt(e.target);
      depth = 0;
      drops.setDragging(false);
      const files = e.dataTransfer?.files;
      if (entry && files && files.length > 0) engine.add(entry.latest.current.target, files);
    };
    const onEnd = () => {
      depth = 0;
      drops.setDragging(false);
    };
    const onPaste = (e: ClipboardEvent) => {
      const files = e.clipboardData?.files;
      if (!files || files.length === 0 || e.defaultPrevented) return;
      const active = document.activeElement;
      if (active instanceof HTMLElement && (active.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName))) return;
      const entry = drops.pasteEntry();
      if (!entry) return;
      e.preventDefault();
      engine.add(entry.latest.current.target, files);
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    window.addEventListener("dragend", onEnd);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("dragend", onEnd);
      window.removeEventListener("paste", onPaste);
    };
  }, [engine, drops]);
  return null;
}

/**
 * What's in flight for one target (`key`), or for every target with none
 * (the Sign out hold, a My jobs row), and `add` to queue more.
 */
export function useUploadQueue(key?: string): UploadQueueView {
  const engine = useUploadEngine();
  const counts = useSyncExternalStore(
    engine ? engine.subscribe : noSubscribe,
    () => (engine ? engine.counts(key) : NO_COUNTS),
    () => NO_COUNTS,
  );
  return useMemo(() => ({ ...counts, add: (target: UploadTarget, files: FileList | readonly File[]) => engine?.add(target, files) }), [counts, engine]);
}

/**
 * Makes `ref`'s element a drop and paste target for `target` while it's
 * mounted (uploads 2.2): a file dropped on it is queued there, and the
 * window guard keeps a stray drop from opening the file in the tab. Pass
 * null while there's nowhere to put files. The state draws the edge and the
 * label (DropLabel); there's no keyboard path, so the target keeps its
 * visible button. Outside an UploadQueueProvider it never lights up.
 */
export function useDropTarget(
  target: UploadTarget | null,
  ref: RefObject<HTMLElement | null>,
  options: DropTargetOptions = { label: "" },
): DropTargetState {
  const ctx = useContext(QueueContext);
  const drops = ctx?.drops ?? null;
  const [id] = useState(() => drops?.nextId() ?? 0);
  const latest = useRef({ target, options });
  useEffect(() => {
    if (target) latest.current = { target, options };
  });
  const enabled = !!target && !options.disabled;
  useEffect(() => {
    if (!drops || !enabled) return;
    return drops.register({ id, ref, latest: latest as DropEntry["latest"] });
  }, [drops, id, ref, enabled]);
  return useSyncExternalStore(
    drops ? drops.subscribe : noSubscribe,
    () => (drops ? drops.stateFor(id) : INACTIVE),
    () => INACTIVE,
  );
}

/**
 * The drop state's look, drawn inside a `relative` box that doesn't clip: the
 * field focus look (a 1px `--act` edge and a 1px inset `--act` ring) 8px
 * outside the box's content, and, on the target under the pointer, the label
 * at the Float level. Nothing at rest (no dashed box anywhere).
 */
export function DropLabel({ state, label }: { state: DropTargetState; label: string }) {
  if (!state.active) return null;
  return (
    <>
      <span aria-hidden="true" className="pointer-events-none absolute -inset-2 z-10 rounded-lg border border-act ring-1 ring-inset ring-act motion-safe:animate-fade-in" />
      {state.over && (
        <span className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <span className="inline-flex items-center gap-2 rounded-lg border border-line-float bg-raised px-3 py-2 text-label text-fg-1 shadow-float animate-pop-in motion-reduce:animate-none">
            <Upload className="size-4 shrink-0 text-fg-3" aria-hidden="true" />
            {label}
          </span>
        </span>
      )}
    </>
  );
}
