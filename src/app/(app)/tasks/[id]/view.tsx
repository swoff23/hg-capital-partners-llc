import type { TaskStatus } from "@prisma/client";
import type { AssigneeContractor, AssigneeUser } from "@/components/assignee-picker";
import { BackLink } from "@/components/back-link";
import { MediaGrid, type MediaItem } from "@/components/media-grid";
import { Section } from "@/components/ui";
import type { Ymd } from "@/lib/dates";
import { deleteTaskFile } from "./actions";
import { TaskActivity, type ActivityRow } from "./activity";
import { Checklist, type ChecklistRow } from "./checklist";
import { Composer, type ComposerDraft } from "./composer";
import { TaskFields, type PropertyOption, type TaskFieldValues } from "./fields";
import { FilesList, type FileLink } from "./files-list";
import { MoreMenu, TitleField } from "./header";
import { NotesField } from "./notes";
import { ReviewBanner } from "./review-banner";
import { StatusControl, WaitingReason } from "./status-control";
import { StatusRunProvider } from "./status-run";

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
  lockbox: { state: "shown" | "pick-unit"; contractor: string; hasLogin: boolean } | null;
  created: string;
  /** First name of the assigned contractor. */
  contractorFirst: string | null;
  /** The assigned contractor has a portal login; until then nothing here says they'll see it now. */
  contractorHasLogin: boolean;
  /** "Connor and Pieter". */
  staffNames: string;
  review: { name: string; fullName: string; isContractor: boolean; photos: number } | null;
  checklist: ChecklistRow[];
  media: MediaItem[];
  files: FileLink[];
  rows: ActivityRow[];
  dayLabels: Record<string, string>;
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
          {/* Centered on the title's first line. */}
          <div className="flex min-w-0 items-center gap-2 [grid-area:status] md:self-start md:pt-2.5">
            <StatusControl
              taskId={task.id}
              status={task.status}
              waitingOn={task.waitingOn}
              scheduledFor={p.values.scheduledFor}
              dueDate={p.values.dueDate}
              today={p.today}
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
              lockbox={p.lockbox}
              created={p.created}
            />
          </Section>
        </aside>

        <div className="min-w-0 space-y-8 pt-2 [grid-area:main] pointer-coarse:space-y-6 lg:pt-4">
          {p.review && <ReviewBanner taskId={task.id} {...p.review} />}

          <div>
            {task.legacyAssignee && <p className="mb-2 text-meta text-fg-3">Assigned in Asana to {task.legacyAssignee}</p>}
            <NotesField taskId={task.id} value={task.description} visibleTo={p.contractorFirst} hasLogin={p.contractorHasLogin} />
          </div>

          <Checklist taskId={task.id} items={p.checklist} />

          {(p.media.length > 0 || p.files.length > 0) && (
            <Section
              title={
                <>
                  {p.media.length > 0 ? "Photos" : "Files"}
                  {p.media.length > 0 && <span className="ml-1.5 font-normal tabular-nums text-fg-3">{p.media.length}</span>}
                </>
              }
            >
              <div className="space-y-3">
                <MediaGrid items={p.media} onDelete={deleteTaskFile} />
                <FilesList files={p.files} onDelete={deleteTaskFile} />
              </div>
            </Section>
          )}

          <Section title="Activity">
            <TaskActivity rows={p.rows} dayLabels={p.dayLabels} />
          </Section>

          {/* Without a login the composer reads as on a job with no contractor ("Shared", "Add a comment"): no reply reaches them yet. */}
          <Composer
            taskId={task.id}
            contractorFirstName={p.contractorHasLogin ? p.contractorFirst : null}
            staffNames={p.staffNames}
            drafts={p.drafts}
            // While the Review banner shows, Approve is the page's one primary.
            quietSend={!!p.review}
          />
        </div>
      </div>
    </StatusRunProvider>
  );
}
