import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, LinkButton, PageHeader, EmptyState } from "@/components/ui";
import { relativeDays } from "@/lib/utils";
import { TaskCheckbox } from "./task-checkbox";
import { TaskFilters } from "./filters";
import type { Prisma } from "@prisma/client";

type SP = { status?: string; assignee?: string; bucket?: string; q?: string; property?: string };

export default async function TasksPage({ searchParams }: PageProps<"/tasks">) {
  const user = await requireUser();
  const sp = (await searchParams) as SP;

  const where: Prisma.TaskWhereInput = {
    ...(sp.status === "done" ? { status: "DONE" } : sp.status === "all" ? {} : { status: "OPEN" }),
    ...(sp.assignee === "me" ? { assigneeUserId: user.id } : {}),
    ...(sp.bucket && sp.bucket !== "all" ? { bucket: sp.bucket } : {}),
    ...(sp.property ? { propertyId: sp.property } : {}),
    ...(sp.q ? { title: { contains: sp.q, mode: "insensitive" } } : {}),
  };

  const [tasks, openCount, mineCount, properties] = await Promise.all([
    prisma.task.findMany({
      where,
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      take: 400,
      include: {
        property: { select: { id: true, address: true } },
        deal: { select: { id: true, address: true } },
        assignee: { select: { name: true } },
      },
    }),
    prisma.task.count({ where: { status: "OPEN" } }),
    prisma.task.count({ where: { status: "OPEN", assigneeUserId: user.id } }),
    prisma.property.findMany({ select: { id: true, address: true }, orderBy: { address: "asc" } }),
  ]);

  return (
    <>
      <PageHeader
        title="Tasks"
        subtitle={`${openCount} open · ${mineCount} assigned to you`}
        actions={
          <LinkButton href="/tasks/new" variant="primary">
            + New task
          </LinkButton>
        }
      />

      <TaskFilters
        current={{
          status: sp.status ?? "open",
          assignee: sp.assignee ?? "all",
          bucket: sp.bucket ?? "all",
          q: sp.q ?? "",
          property: sp.property ?? "",
        }}
        properties={properties}
      />

      <Card className="mt-4 max-h-[70vh] overflow-auto overscroll-contain">
        {tasks.length === 0 ? (
          <div className="p-4">
            <EmptyState>No tasks match.</EmptyState>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {tasks.map((t) => (
              <li key={t.id} className="flex items-start gap-3 px-4 py-2.5">
                <div className="pt-0.5">
                  <TaskCheckbox id={t.id} done={t.status === "DONE"} />
                </div>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/tasks/${t.id}`}
                    className={`text-sm hover:underline ${t.status === "DONE" ? "text-muted line-through" : ""}`}
                  >
                    {t.title}
                  </Link>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
                    {t.property && (
                      <Link href={`/properties/${t.property.id}`} className="hover:underline">
                        {t.property.address.split(",")[0]}
                      </Link>
                    )}
                    {t.deal && (
                      <Link href={`/deals/${t.deal.id}`} className="hover:underline">
                        deal: {t.deal.address.split(",")[0]}
                      </Link>
                    )}
                    {!t.property && !t.deal && <span>{t.bucket}</span>}
                    {(t.assignee?.name || t.assigneeName) && (
                      <span>· {t.assignee?.name ?? t.assigneeName}</span>
                    )}
                  </div>
                </div>
                {t.dueDate && (
                  <span
                    className={`shrink-0 pt-0.5 text-xs ${
                      t.status === "OPEN" && new Date(t.dueDate) < new Date()
                        ? "font-medium text-red-600"
                        : "text-muted"
                    }`}
                  >
                    {relativeDays(t.dueDate)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {tasks.length === 400 && <p className="mt-2 text-xs text-muted">Showing first 400.</p>}
    </>
  );
}

export const dynamic = "force-dynamic";
