import Link from "next/link";
import type { TaskStatus } from "@prisma/client";
import { Plus } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { STATUS_TONE, StatusBadge, StatusMark } from "@/components/status-badge";
import { LinkButton, Section } from "@/components/ui";
import { fmtDay, type Ymd } from "@/lib/dates";
import { STATUS_LABEL } from "@/lib/task-scope";
import { cn } from "@/lib/utils";
import { Count } from "./record-ui";

export type PropertyTask = {
  id: string;
  title: string;
  status: TaskStatus;
  /** The task's Target (D7: the visit date while Scheduled, otherwise Due). */
  target: string | null;
  /** A past Target by Today's rule (isTargetLate). */
  late: boolean;
  who: { label: string; name: string | null; email: string | null; contractor: boolean } | null;
};

/**
 * The property's open tasks, soonest first. Every row shows its status as
 * the mark and its word in one fixed column, and the whole row opens the
 * task (docs/brand-guidelines.md, section 9). In a list under 30rem (the
 * rail, a phone) a row keeps two lines: the title, then the status word in
 * its tone and the date.
 */
export function PropertyTasksSection({
  propertyId,
  tasks,
  today,
}: {
  propertyId: string;
  tasks: PropertyTask[];
  today: Ymd;
}) {
  return (
    <Section
      as="h3"
      title={
        // One line at 320, where the two buttons leave the heading about 50px: the count
        // drops there (the fact strip above carries the same number) and the word truncates.
        <span className="block truncate">
          Tasks
          {tasks.length > 0 && <Count n={tasks.length} className="max-[359px]:hidden" />}
        </span>
      }
      actions={
        <>
          <LinkButton href={`/templates?property=${propertyId}`} size="sm">
            Apply playbook
          </LinkButton>
          <LinkButton href={`/tasks/new?propertyId=${propertyId}`} size="sm">
            <Plus aria-hidden="true" strokeWidth={1.75} className="h-4 w-4" />
            Task
          </LinkButton>
        </>
      }
    >
      {tasks.length === 0 ? (
        <p className="text-body text-fg-3">No open tasks.</p>
      ) : (
        <ul className="@container divide-y divide-line">
          {tasks.map((t) => {
            const date = t.target ? fmtDay(t.target, { year: "auto", now: today }) : null;
            return (
              <li
                key={t.id}
                className="group relative grid min-h-10 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 py-2 pointer-coarse:min-h-12 @min-[30rem]:grid-cols-[7.5rem_minmax(0,1fr)_auto_6rem]"
              >
                <Link
                  href={`/tasks/${t.id}`}
                  className="absolute inset-0 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-act"
                >
                  <span className="sr-only">{t.title}</span>
                </Link>

                {/* The status column: the mark alone in a narrow list, the mark and its word from 30rem. */}
                <span className="pointer-events-none flex self-start pt-0.5 @min-[30rem]:self-center @min-[30rem]:pt-0">
                  <StatusMark status={t.status} className="@min-[30rem]:hidden" />
                  <StatusBadge status={t.status} className="hidden @min-[30rem]:inline-flex" />
                </span>

                <div className="pointer-events-none min-w-0">
                  <p className="truncate text-body text-fg-1 underline-offset-3 group-hover:underline">{t.title}</p>
                  <p className="truncate text-meta text-fg-3 @min-[30rem]:hidden">
                    <span className={STATUS_TONE[t.status]}>{STATUS_LABEL[t.status]}</span>
                    {date && (
                      <>
                        {" · "}
                        <span className={cn("num", t.late && "text-danger")}>{date}</span>
                      </>
                    )}
                  </p>
                </div>

                {/* Under the row's link like the rest of the row, so a click on it opens the task; the task page names the person. */}
                <span className="pointer-events-none flex w-5 justify-center">
                  {t.who && (
                    <>
                      <Avatar name={t.who.name} email={t.who.email} size={20} outline={t.who.contractor} />
                      <span className="sr-only">{t.who.label}</span>
                    </>
                  )}
                </span>

                <span
                  className={cn(
                    "num pointer-events-none hidden whitespace-nowrap text-right text-meta @min-[30rem]:block",
                    t.late ? "text-danger" : date ? "text-fg-2" : "text-fg-3",
                  )}
                >
                  {date ?? "—"}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
