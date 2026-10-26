"use client";
import { createContext, useContext, type ReactNode, type RefObject } from "react";
import type { FileKind } from "@/lib/attachments/content-types";
import type { UploadKind } from "@/lib/attachments/upload-kinds";
import type { RecordMediaInput, RecordMediaResult } from "@/components/media-uploader";

/**
 * One upload queue for the app and the portal (docs/specs/uploads-photos.md
 * 2.1 and 2.2): every surface hands its files to the queue under a target,
 * and the queue checks, prepares and uploads them whether or not the page
 * that started them is still open. Mounted once in each layout,
 * src/app/(app)/layout.tsx (inside AppShell, under the LeaveGuard) and
 * src/app/(portal)/p/layout.tsx, so it holds Sign out while files are going
 * up (build plan conflict 33) and its toasts reach every page.
 *
 *   const target: UploadTarget = { key: `task:${id}`, label: "56 Tamarack St", uploadKind: "task-upload", … };
 *   const { pending, failed, add } = useUploadQueue(target.key);
 *   const drop = useDropTarget(target, mainRef, { label: "Drop to add to this reply" });
 *
 * Contract (build plan 1.5): the names, props and types here are final, and
 * UP1 fills in the body. Until then the provider passes its children
 * through, useUploadQueue reports nothing in flight and `add` does nothing,
 * and useDropTarget never lights up: every surface still uploads through its
 * own useMediaUploader, as before.
 */

/** One place files land. The queue is keyed by `key`. */
export type UploadTarget = {
  /** "task:<id>", "portal-task:<id>", "property-doc:<id>", "listing:<id>", "property-photo:<id>", "contractor-doc:<id>:w9". */
  key: string;
  /** "56 Tamarack St": for toasts and accessible names. */
  label: string;
  /** The /api/blob/[kind] token route (lib/attachments/upload-kinds.ts). */
  uploadKind: UploadKind;
  /** The row the token route checks: the task's id for task kinds, the property's for property kinds. */
  parentId: string;
  /** Listing and property photos are public; everything else is private. */
  access: "private" | "public";
  /** What this target accepts, from UPLOAD_RULES. */
  allowed: readonly FileKind[];
  /** A cap on files in flight plus those already held (a listing: 20 minus what it holds). */
  maxFiles?: number;
  /** "display" re-encodes a photo to a 2560px JPEG with no metadata before it goes up; "original" sends it as picked. */
  prepare: "original" | "display";
  /** Writes the row once the bytes are up. The server checks the blob itself. */
  record: (file: RecordMediaInput) => Promise<RecordMediaResult>;
  /** The new rows' ids each time a batch lands, while the page that set the target is mounted. */
  onRecorded?: (ids: string[]) => void;
  /** Once the page is gone: "hold" keeps the files as drafts (staff replies), "post" posts them as their own update (contractors). */
  whenAway: "hold" | "post";
};

/** What's in flight for one target, or for every target. */
export type UploadCounts = {
  /** Not recorded yet: queued, being prepared, going up or being saved. */
  pending: number;
  /** Held for a signal (phase 3, the outbox): they retry on their own. */
  waiting: number;
  /** Refused or out of retries: each waits for a Retry or a Remove. */
  failed: number;
  /** The kinds of the pending files, for "3 photos are still uploading" (job-view stillUploading). */
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
};

const NOTHING: UploadCounts = { pending: 0, waiting: 0, failed: 0, pendingKinds: [] };

const IDLE: UploadQueueView = { ...NOTHING, add: () => {} };

const QueueContext = createContext<UploadQueueView>(IDLE);

/** The queue for everything under it. Mounted once per layout; a second one inside would split the counts. */
export function UploadQueueProvider({ children }: { children: ReactNode }) {
  return <QueueContext value={IDLE}>{children}</QueueContext>;
}

/**
 * What's in flight for one target (`key`), or for every target with none
 * (the Sign out hold, a My jobs row), and `add` to queue more.
 */
export function useUploadQueue(key?: string): UploadQueueView {
  void key;
  return useContext(QueueContext);
}

/**
 * Makes `ref`'s element a drop and paste target for `target` while it's
 * mounted (uploads 2.2): a file dropped on it is queued there, and the
 * window guard keeps a stray drop from opening the file in the tab. Pass
 * null while there's nowhere to put files. The state draws the edge and the
 * label; there's no keyboard path, so the target keeps its visible button.
 */
export function useDropTarget(
  target: UploadTarget | null,
  ref: RefObject<HTMLElement | null>,
  options?: DropTargetOptions,
): DropTargetState {
  void target;
  void ref;
  void options;
  return { active: false, over: false };
}
