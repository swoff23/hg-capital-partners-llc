import type { TaskStatus } from "@prisma/client";
import type { AssigneeContractor, AssigneeUser, AssigneeValue } from "@/components/assignee-picker";
import { BackLink } from "@/components/back-link";
import type { FileLink } from "@/components/files-list";
import type { MediaItem } from "@/components/media-grid";
import { ComposerDropZone, PendingSendsProvider } from "@/components/composer";
import { Section } from "@/components/ui";
import type { Ymd } from "@/lib/dates";
import { TaskActivity, type ActivityRow } from "./activity";
import { Checklist, type ChecklistRow } from "./checklist";
import { Composer, type ComposerDraft } from "./composer";
import { TaskFields, type PropertyOption, type TaskFieldValues } from "./fields";
import { MoreMenu, TitleField } from "./header";
import { NotesField } from "./notes";
import { ReviewSlot, type ReviewDecision, type ReviewProof } from "./review-banner";
import { StatusControl, WaitingReason } from "./status-control";
import { StatusRunProvider } from "./status-run";
import { TaskMediaSection } from "./task-media";

export interface TaskPageViewProps {
  task: {
    id: string;
    title: string;
    description: string | null;
    status: TaskStatus;
    waitingOn: string | null;
    /** Legacy free-text assignee from the CSV import, when no person is set. */
    legacyAssignee: string | null;
  };
  today: Ymd;
  active: boolean;
  overdue: boolean;
  values: TaskFieldValues;
  users: AssigneeUser[];
  contractors: AssigneeContractor[];
  properties: PropertyOption[];
  /** The signed-in user, for "(you)" and the short names below sm. */
  meId: string;
  /** Their name as comments carry it, for a message of theirs that is still sending. */
  meName: string;
  /** The people the viewer assigned last, for the assignee picker's Recent rows. */
  recent: AssigneeValue[];
  /** The date the series gave this task when it is a repeat copy (its CREATED line), null otherwise. */
  repeatSlot: Ymd | null;
  lockbox: { state: "shown" | "pick-unit"; contractor: string; hasLogin: boolean } | null;
  created: string;
  /** First name of the assigned contractor. */
  contractorFirst: string | null;
  /** The assigned contractor has a portal login; until then nothing here says they'll see it now. */
  contractorHasLogin: boolean;
  /** The assigned contractor, for the composer's line over the field. */
  contractor: { id: string; first: string; hasLogin: boolean } | null;
  /** The partners' first names: who sees an Internal note. */
  staffFirstNames: string[];
  /** The proof the Review banner shows while the job waits on staff, else null. */
  review: ReviewProof | null;
  /** Who decided, while nothing has moved since: the banner's one-line outcome. */
  decision: ReviewDecision | null;
  checklist: ChecklistRow[];
  media: MediaItem[];
  files: FileLink[];
  /** The ids in `media` sent with the latest Mark done (lib/tasks/media.ts taskMedia). */
  atFinish?: readonly string[];
  rows: ActivityRow[];
  /** When this person last opened the task before now (ISO): the New divider's baseline. */
  newSince: string | null;
  /** The `clientId`s of the comments on the page, so a message mid-send at a reload isn't posted twice. */
  sentClientIds: string[];
  /** When the page was rendered (ISO), so the times read the same on the server and in the browser. */
  now: string;
  /** My uploads waiting in the composer from an earlier visit. */
  drafts: ComposerDraft[];
}

/**
 * The task page's layout (docs/asana-migration-plan.md §6, D31 "page with
 * side rail"). A record page: it caps at 1200px with a 320px rail
 * (docs/brand-guidelines.md, section 5). Main column: status and title,
 * review banner, notes, then flat sections for the checklist, photos and
 * files, and activity, and the composer. The fields sit in a sticky Details
 * rail from lg up and a chip row under the title below that; one grid,
 * rearranged by its template areas.
 */
export function TaskPageView(p: TaskPageViewProps) {
  const { task } = p;
  return (
    <StatusRunProvider>
      <div
        className={
          "grid max-w-300 gap-x-10 [grid-template-areas:'head'_'fields'_'main'] " +
          // Below md the page is at least the screen tall under the top bar, and the main area takes the spare
          // height, so the composer sits on the bottom edge even on a short task (activity 2.7). The 2rem is the
          // page's own top and bottom padding, so a short task has nothing to scroll.
          "max-md:min-h-[calc(100dvh-var(--app-bar-h)-2rem)] max-md:grid-rows-[auto_auto_1fr] " +
          "lg:grid-cols-[minmax(0,1fr)_20rem] lg:[grid-template-areas:'head_fields'_'main_fields']"
        }
      >
        <header
          className={
            "grid min-w-0 items-center gap-x-2 gap-y-1 [grid-area:head] " +
            "grid-cols-[minmax(0,1fr)_auto_auto] [grid-template-areas:'back_status_more'_'title_title_title'_'reason_reason_reason'] " +
            "md:grid-cols-[auto_minmax(0,1fr)_auto] md:[grid-template-areas:'back_back_back'_'status_title_more'_'._reason_.']"
          }
        >
          <div className="[grid-area:back]">
            <BackLink fallback="/tasks" label="Tasks" />
          </div>
          {/* Centered on the title's first line: the 32px menu button, not a 20px badge. */}
          <div className="flex min-w-0 items-center gap-2 [grid-area:status] md:self-start md:pt-1">
            <StatusControl
              taskId={task.id}
              status={task.status}
              waitingOn={task.waitingOn}
              scheduledFor={p.values.scheduledFor}
              today={p.today}
              hasContractor={!!p.values.assignee && "contactId" in p.values.assignee}
            />
          </div>
          <div className="min-w-0 [grid-area:title]">
            <TitleField taskId={task.id} title={task.title} closed={!p.active} />
          </div>
          <div className="[grid-area:more] md:self-start md:pt-1">
            <MoreMenu taskId={task.id} title={task.title} active={p.active} status={task.status} waitingOn={task.waitingOn} />
          </div>
          {task.status === "WAITING" && task.waitingOn && (
            <div className="min-w-0 [grid-area:reason]">
              <WaitingReason taskId={task.id} waitingOn={task.waitingOn} />
            </div>
          )}
        </header>

        <aside aria-label="Task details" className="min-w-0 [grid-area:fields] lg:sticky lg:top-20 lg:self-start">
          {/* The Details heading and its rule from lg, where the fields are a rail; below
              that they're a row of chips under the title, with no heading. */}
          <Section title="Details" className="max-lg:[&>div:first-child]:hidden max-lg:[&>div:last-child]:pt-0">
            <TaskFields
              taskId={task.id}
              today={p.today}
              status={task.status}
              overdue={p.overdue}
              values={p.values}
              users={p.users}
              contractors={p.contractors}
              properties={p.properties}
              meId={p.meId}
              recent={p.recent}
              repeatSlot={p.repeatSlot}
              lockbox={p.lockbox}
              created={p.created}
            />
          </Section>
        </aside>

        <PendingSendsProvider author={p.meName}>
          {/* The whole main column is one drop target for the composer's tray (uploads 2.2). */}
          <ComposerDropZone className="min-w-0 space-y-8 pt-2 [grid-area:main] pointer-coarse:space-y-6 max-md:flex max-md:flex-col lg:pt-4">
            <ReviewSlot
              taskId={task.id}
              review={p.review}
              decision={p.decision}
              contractor={p.contractorFirst}
              hasLogin={p.contractorHasLogin}
              now={p.now}
            />

            <div>
              {task.legacyAssignee && <p className="mb-2 text-meta text-fg-3">Assigned in Asana to {task.legacyAssignee}</p>}
              <NotesField taskId={task.id} value={task.description} visibleTo={p.contractorFirst} hasLogin={p.contractorHasLogin} />
            </div>

            <Checklist taskId={task.id} items={p.checklist} />

            <TaskMediaSection
              taskId={task.id}
              media={p.media}
              files={p.files}
              atFinish={p.atFinish}
              // For "Set as property photo" in the viewer (uploads 2.10).
              property={propertyOf(p.properties, p.values.propertyId)}
            />

            <Section title="Activity">
              <TaskActivity taskId={task.id} rows={p.rows} now={p.now} today={p.today} newSince={p.newSince} />
            </Section>

            {/* Without a login the composer reads as on a job with no contractor ("Shared", "Add a comment"): no reply reaches them yet. */}
            <Composer
              taskId={task.id}
              taskTitle={task.title}
              contractor={p.contractor}
              staff={p.staffFirstNames}
              drafts={p.drafts}
              sentClientIds={p.sentClientIds}
            />
          </ComposerDropZone>
        </PendingSendsProvider>
      </div>
    </StatusRunProvider>
  );
}

/** The task's property as the photos section needs it: its id and short address. */
function propertyOf(properties: PropertyOption[], id: string | null | undefined): { id: string; label: string } | null {
  const found = id ? properties.find((x) => x.id === id) : undefined;
  return found ? { id: found.id, label: found.label } : null;
}
