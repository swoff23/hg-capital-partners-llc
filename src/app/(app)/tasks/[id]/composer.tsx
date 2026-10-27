"use client";
import { Composer as SharedComposer, type ComposerDraft } from "@/components/composer";
import { taskFileUrl } from "@/lib/attachments/media";
import { recordTaskAttachment } from "../upload-actions";
import { addTaskComment, deleteTaskFile } from "./actions";

export type { ComposerDraft } from "@/components/composer";

/**
 * The task page's composer: the shared Composer (components/composer.tsx)
 * wired to this task. Replies post through addTaskComment, Shared by default
 * (D15); Internal is for the partners alone. Files upload as Internal until
 * Send (core.addComment gives them the message's visibility), and the page
 * hands back any left from an earlier visit as `drafts`. The staff wiring
 * stays here, so the shared component never imports from app/(app).
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
  return (
    <SharedComposer
      // The staff surface's key; the portal's composer keeps its own, so an Internal draft never opens there.
      draftKey={`hgos-task-draft:${taskId}`}
      visibility="switch"
      pin="phone"
      audience={{ internal: `Only ${staffNames} see this` }}
      placeholders={{
        shared: contractorFirstName ? `Reply to ${contractorFirstName}` : "Add a comment",
        internal: "Add an internal note",
      }}
      uploader={{
        options: {
          taskId,
          uploadKind: "task-upload",
          allowed: ["image", "video", "file"],
          // Internal until Send, so a contractor can't open it while it waits.
          record: (file) => recordTaskAttachment(taskId, { ...file, visibility: "INTERNAL", standalone: false }),
        },
        drafts,
        remove: (draft) => deleteTaskFile(draft.id),
        fileUrl: taskFileUrl,
      }}
      // clientId waits for addTaskComment's schema to take it (activity slice 3): a strict schema refuses unknown keys.
      onSend={({ body, visibility, attachmentIds }) => addTaskComment(taskId, { body, visibility, attachmentIds })}
    />
  );
}
