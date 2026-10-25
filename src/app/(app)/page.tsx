import { MailWarning } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { PageHeader, chromeIconClass } from "@/components/ui";
import { todayYmdEastern } from "@/lib/dates";
import { needsYou } from "@/lib/home/queries";
import { cn } from "@/lib/utils";
import { greetingLine, summaryLine } from "@/lib/home/summary";
import { groupMine } from "@/lib/tasks/list";
import { emailCapReached, todayTasks } from "@/lib/tasks/queries";
import { NeedsYou } from "./needs-you";
import { TaskListProvider } from "./tasks/task-list-context";
import { TodayView } from "./tasks/today-view";

export const dynamic = "force-dynamic";

/**
 * Home is Today (docs/home-as-today.md): the greeting and one line that
 * answers the page, the Needs you list, then Today's Mine | Contractors
 * columns. Capped at 1200 so the two columns don't stretch to 1600. Home's
 * own query params never use `view`, which TodayView keeps for its column
 * pick below lg.
 */
export default async function HomePage() {
  const user = await requireUser();
  const now = new Date();
  // Buffalo's today, decided once on the server so every section and label agrees.
  const today = todayYmdEastern(now);
  const [tasks, capped, items] = await Promise.all([todayTasks(user.id), emailCapReached(today), needsYou(today, now)]);
  // The Overdue section of the partner's own Mine column.
  const late = groupMine(tasks, user.id, today).overdue.length;

  return (
    <div className="max-w-300">
      <PageHeader title={greetingLine(user.name, now)} subtitle={summaryLine(items.length, late) ?? undefined} />

      {items.length > 0 && <NeedsYou items={items} className="mb-8 pointer-coarse:mb-6" />}

      {capped && (
        <p role="status" className="mb-4 flex items-center gap-2 rounded-md border border-line bg-surface px-3 py-2 text-body text-fg-1">
          <MailWarning className={cn(chromeIconClass, "text-fg-3")} aria-hidden="true" />
          {/* One line at every width: phones get the first sentence only. */}
          <span>
            Email limit reached today.<span className="max-sm:hidden"> Some updates are waiting to send.</span>
          </span>
        </p>
      )}
      <TaskListProvider tasks={tasks} today={today}>
        <TodayView userId={user.id} />
      </TaskListProvider>
    </div>
  );
}
