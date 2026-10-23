import { redirect } from "next/navigation";
import { MailWarning } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { todayYmdEastern } from "@/lib/dates";
import { emailCapReached, todayTasks } from "@/lib/tasks/queries";
import { TaskListProvider } from "./task-list-context";
import { TasksHeader } from "./tasks-header";
import { TodayView } from "./today-view";

/** Filters that belong to the All tab. Old links to /tasks?status=done land there. */
const ALL_PARAMS = ["status", "owner", "assignee", "q", "property"];

export default async function TodayPage({ searchParams }: PageProps<"/tasks">) {
  const user = await requireUser();
  const sp = await searchParams;
  if (ALL_PARAMS.some((k) => typeof sp[k] === "string")) {
    const qs = new URLSearchParams();
    for (const k of ALL_PARAMS) if (typeof sp[k] === "string") qs.set(k, sp[k]);
    redirect(`/tasks/all?${qs.toString()}`);
  }

  // Buffalo's today, decided once on the server so every section and label agrees.
  const today = todayYmdEastern();
  const [tasks, capped] = await Promise.all([todayTasks(user.id), emailCapReached(today)]);

  return (
    <>
      <TasksHeader />
      {capped && (
        <p role="status" className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
          <MailWarning className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
          {/* One line at every width: phones get the first sentence only. */}
          <span>
            Email limit reached today.<span className="max-sm:hidden"> Some updates are waiting to send.</span>
          </span>
        </p>
      )}
      <TaskListProvider tasks={tasks} today={today}>
        <TodayView userId={user.id} />
      </TaskListProvider>
    </>
  );
}

export const dynamic = "force-dynamic";
