"use client";
import { MailX } from "lucide-react";
import { AudienceText, Composer as SharedComposer, type ComposerDraft } from "@/components/composer";
import { TextLink } from "@/components/ui";
import type { UploadTarget } from "@/components/upload-queue";
import { taskFileUrl } from "@/lib/attachments/media";
import { UPLOAD_KIND_ALLOWED, uploadTargetHref, uploadTargetKey } from "@/lib/attachments/upload-kinds";
import { personalDraftKey } from "@/lib/composer-draft";
import { joinNames } from "@/lib/portal/job-view";
import type { TaskEmailState } from "@/lib/tasks/delivery";
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
 *
 * The line over the field says who will see the message (activity 2.7), only
 * where that isn't the default: nothing for a contractor with a login unless
 * their Job emails are off or their address isn't getting mail (then a warning
 * strip with MailX: "Emails don't reach Zack Miller.", from a
 * bounce, a suppression or a spam report, emails-redesign section 5), "needs a
 * login" without one, nothing when nobody is assigned, and for an Internal
 * note the partners.
 * The switch reads "Shared | Internal" on every task: Internal is the only
 * way to keep a note private before a contractor is assigned.
 */
export function Composer({
  taskId,
  taskTitle,
  viewerId,
  contractor,
  staff,
  drafts,
  sentClientIds,
}: {
  taskId: string;
  taskTitle: string;
  /** The signed-in partner, whose draft this box keeps. */
  viewerId: string;
  /**
   * The assigned contractor, if any: their first name and full name, their contact id (for "Set up login"), whether
   * they have a portal login, and whether a reply emails them (docs/specs/contractor-email-switch.md: not before their
   * first sign-in, and not with their Job emails switch off) and gets there (tasks/delivery.ts taskEmailState).
   */
  contractor: { id: string; first: string; name?: string; hasLogin: boolean; emails: TaskEmailState } | null;
  /** The partners' first names: who sees an Internal note. */
  staff: readonly string[];
  /** My uploads on this task not yet sent with a message, oldest first. */
  drafts: ComposerDraft[];
  /** The `clientId`s of the comments the page holds, so a message that was mid-send at a reload isn't posted twice. */
  sentClientIds: readonly string[];
}) {
  // One place the queue puts this task's files, and the target a drop or a paste anywhere on the page feeds.
  const target: UploadTarget = {
    key: uploadTargetKey("task-upload", taskId),
    label: taskTitle,
    uploadKind: "task-upload",
    parentId: taskId,
    access: "private",
    allowed: UPLOAD_KIND_ALLOWED["task-upload"],
    prepare: "original",
    // Internal until Send, so a contractor can't open it while it waits. The queue names its owner, and the server
    // refuses the record step when someone else is signed in now (queue-owner.ts).
    record: (file, owner) => recordTaskAttachment(taskId, { ...file, visibility: "INTERNAL", standalone: false }, owner),
    // A file that lands with this page gone stays a draft for the next visit.
    whenAway: "hold",
    href: uploadTargetHref("task-upload", taskId),
  };

  // Without a login no reply reaches them yet: the composer reads as on a job with no contractor, and says so.
  const reachable = contractor?.hasLogin ? contractor : null;
  const only =
    staff.length >= 3 ? "Only the HG team sees this" : staff.length === 2 ? `Only ${joinNames([...staff])} see this` : staff.length === 1 ? `Only ${staff[0]} sees this` : "Only the HG team sees this";

  return (
    <SharedComposer
      // The staff surface's key, per partner; the portal's composer keeps its own, so an Internal draft never opens there.
      draftKey={personalDraftKey("task", taskId, viewerId)}
      visibility="switch"
      pin="phone"
      audience={{
        shared: reachable ? (
          // No line at all unless their Job emails switch is off (Connor, Nov 16): seeing it is the default, so saying
          // so is noise. Before their first sign-in no email goes either; the line under the sent comment says
          // "Zack hasn't signed in yet".
          reachable.emails === "off" ? (
            <>
              {/* A narrow box (a phone) keeps the news; a wider one adds what to do about it. The long one needs
                  about 560px (614 with touch type), so it waits for a 672px box. "them", not a guessed pronoun:
                  this shows for every contractor. */}
              <span className="flex min-w-0 @2xl/composer:hidden">
                <AudienceText name={reachable.first} words="does not receive emails" />
              </span>
              <span className="hidden min-w-0 @2xl/composer:flex">
                <AudienceText
                  name={reachable.first}
                  words="does not receive email notifications. Remember to call or text them any updates."
                />
              </span>
            </>
          ) : reachable.emails === "not-getting-through" ? (
            <>
              {/* Their full name, which truncates before the line could wrap at 320; a box of 672px or more adds what
                  to do, in the off line's words. */}
              <span className="flex min-w-0 @2xl/composer:hidden">
                <NotGettingThrough name={reachable.name || reachable.first} />
              </span>
              <span className="hidden min-w-0 @2xl/composer:flex">
                <NotGettingThrough name={reachable.name || reachable.first} then=" Remember to call or text them any updates." />
              </span>
            </>
          ) : null
        ) : contractor ? (
          <span className="flex min-w-0 items-baseline gap-2">
            <AudienceText name={contractor.first} words="needs a login to see this" />
            {/* Where the login is set up: the contractor's record. A mouse has room for it; a phone keeps the one line. */}
            <TextLink href={`/contractors/${contractor.id}`} className="hidden shrink-0 md:inline">
              Set up login
            </TextLink>
          </span>
        ) : null, // Nobody assigned: no line (Connor, Nov 16).
        internal: <AudienceText words={only} />,
        warn: reachable?.emails === "off" || reachable?.emails === "not-getting-through" ? MailX : undefined,
      }}
      placeholders={{
        // One placeholder whoever is assigned (Connor, Nov 14).
        shared: "Add comment…",
        internal: "Add an internal note",
        internalShort: "Internal note",
      }}
      sendLabel={{ shared: "Send", internal: "Add note" }}
      sentClientIds={sentClientIds}
      uploader={{
        options: { target },
        drafts,
        remove: (draft) => deleteTaskFile(draft.id),
        fileUrl: taskFileUrl,
      }}
      onSend={({ body, visibility, attachmentIds, clientId }) => addTaskComment(taskId, { body, visibility, attachmentIds, clientId })}
    />
  );
}

/**
 * "Emails don't reach Zack Miller." as AudienceText lays a line out: the name truncates, the fixed
 * words around it stay whole. AudienceText puts the name first, and this sentence has it in the middle.
 */
function NotGettingThrough({ name, then = "" }: { name: string; then?: string }) {
  return (
    <span className="flex min-w-0">
      <span className="shrink-0 whitespace-pre">{"Emails don't reach "}</span>
      <span className="min-w-0 truncate">{name}</span>
      <span className="shrink-0 whitespace-pre">{`.${then}`}</span>
    </span>
  );
}
