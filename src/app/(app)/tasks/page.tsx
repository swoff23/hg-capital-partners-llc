import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  Card,
  CardHeader,
  CardTitle,
  LinkButton,
  PageHeader,
  Table,
  Th,
  EmptyState,
} from "@/components/ui";
import { TaskFilters } from "./filters";
import { SortHeader } from "./sort-header";
import { TaskRow } from "./task-row";
import { shortAddress } from "@/lib/normalize";
import { toYmd } from "@/lib/dates";
import { excludeTemplateTasks } from "@/lib/task-scope";
import type { Prisma } from "@prisma/client";

type SP = {
  status?: string;
  assignee?: string; // legacy ?assignee=me shortcut, still honored
  owner?: string; // "u:<userId>" | "n:<name>" | "none"
  q?: string;
  property?: string;
  sort?: string; // "task" | "address" | "owner" | "due", "-" prefix = descending; default "due"
};

const PAGE = 400;

type TaskListItem = Prisma.TaskGetPayload<{
  include: {
    property: { select: { id: true; address: true } };
    deal: { select: { id: true; address: true } };
    assignee: { select: { name: true } };
  };
}>;

/** In-memory sort — owner/address are coalesced across relations, so we can't do it in SQL. */
function sortTasks(list: TaskListItem[], field: string, desc: boolean): TaskListItem[] {
  const key = (t: TaskListItem): string | number | null => {
    switch (field) {
      case "task":
        return t.title.toLowerCase();
      case "address":
        return (t.property?.address ?? t.deal?.address ?? "").toLowerCase();
      case "owner":
        return (t.assignee?.name ?? t.assigneeName ?? "").toLowerCase();
      default: // "due"
        return t.dueDate ? t.dueDate.getTime() : null;
    }
  };
  const newest = (a: TaskListItem, b: TaskListItem) => b.createdAt.getTime() - a.createdAt.getTime();
  return [...list].sort((a, b) => {
    const x = key(a);
    const y = key(b);
    const xMissing = x === null || x === "";
    const yMissing = y === null || y === "";
    if (xMissing || yMissing) return xMissing && yMissing ? newest(a, b) : xMissing ? 1 : -1;
    if (x !== y) return (x < y ? -1 : 1) * (desc ? -1 : 1);
    return newest(a, b);
  });
}

export default async function TasksPage({ searchParams }: PageProps<"/tasks">) {
  const user = await requireUser();
  const sp = (await searchParams) as SP;

  const owner = sp.owner ?? (sp.assignee === "me" ? `u:${user.id}` : "");
  const ownerWhere: Prisma.TaskWhereInput = owner.startsWith("u:")
    ? { assigneeUserId: owner.slice(2) }
    : owner.startsWith("n:")
      ? { assigneeName: owner.slice(2) }
      : owner === "none"
        ? { assigneeUserId: null, assigneeName: null }
        : {};

  const where: Prisma.TaskWhereInput = {
    ...excludeTemplateTasks,
    ...(sp.status === "done" ? { status: "DONE" } : sp.status === "all" ? {} : { status: "OPEN" }),
    ...ownerWhere,
    ...(sp.property ? { propertyId: sp.property } : {}),
    ...(sp.q ? { title: { contains: sp.q, mode: "insensitive" } } : {}),
  };

  const sortRaw = sp.sort ?? "";
  const sortDesc = sortRaw.startsWith("-");
  const sortField = (sortDesc ? sortRaw.slice(1) : sortRaw) || "due";

  // Only the default due-date sort can be pushed to SQL: address and owner
  // are coalesced across relations (property/deal, user/free text). Those
  // sorts fetch the whole filtered set and sort in memory — sorting a
  // truncated page would show a random 400, not the top 400.
  const sqlSorted = sortField === "due";

  const [tasks, matchCount, openCount, mineCount, properties, users, externalOwners] = await Promise.all([
    prisma.task.findMany({
      where,
      orderBy: [{ dueDate: { sort: sortDesc ? "desc" : "asc", nulls: "last" } }, { createdAt: "desc" }],
      ...(sqlSorted ? { take: PAGE } : {}),
      include: {
        property: { select: { id: true, address: true } },
        deal: { select: { id: true, address: true } },
        assignee: { select: { name: true } },
      },
    }),
    prisma.task.count({ where }),
    prisma.task.count({ where: { status: "OPEN", ...excludeTemplateTasks } }),
    prisma.task.count({ where: { status: "OPEN", assigneeUserId: user.id, ...excludeTemplateTasks } }),
    prisma.property.findMany({ select: { id: true, address: true }, orderBy: { address: "asc" } }),
    prisma.user.findMany({ select: { id: true, name: true, email: true } }),
    prisma.task.findMany({
      where: { assigneeUserId: null, assigneeName: { not: null } },
      select: { assigneeName: true },
      distinct: ["assigneeName"],
      orderBy: { assigneeName: "asc" },
    }),
  ]);

  const owners = {
    users: users
      .slice()
      .sort((a, b) =>
        a.id === user.id
          ? -1
          : b.id === user.id
            ? 1
            : (a.name ?? a.email).localeCompare(b.name ?? b.email),
      )
      .map((u) => ({
        value: `u:${u.id}`,
        label: (u.name ?? u.email) + (u.id === user.id ? " (me)" : ""),
      })),
    external: externalOwners
      .map((t) => t.assigneeName)
      .filter((n): n is string => !!n)
      .map((n) => ({ value: `n:${n}`, label: n })),
  };

  // When scoped to one property, drop the Address column and name it in the header instead.
  const scopedProperty = sp.property ? (properties.find((p) => p.id === sp.property) ?? null) : null;
  const showAddress = !scopedProperty;

  const sortedTasks = sqlSorted ? tasks : sortTasks(tasks, sortField, sortDesc).slice(0, PAGE);

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
          owner,
          q: sp.q ?? "",
          property: sp.property ?? "",
        }}
        owners={owners}
        properties={properties}
      />

      <Card className="mt-4 overflow-hidden">
        {scopedProperty && (
          <CardHeader>
            <Link href={`/properties/${scopedProperty.id}`} className="hover:underline">
              <CardTitle>{shortAddress(scopedProperty.address)}</CardTitle>
            </Link>
          </CardHeader>
        )}

        {tasks.length === 0 ? (
          <div className="p-4">
            <EmptyState>No tasks match.</EmptyState>
          </div>
        ) : (
          <Table className="table-fixed">
            <thead>
              <tr>
                <Th className="w-11 pr-0" />
                <SortHeader label="Task" field="task" />
                {showAddress && <SortHeader label="Address" field="address" className="w-44" />}
                <SortHeader label="Owner" field="owner" className="w-24" />
                <SortHeader label="Due" field="due" className="w-32" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sortedTasks.map((t) => (
                <TaskRow
                  key={t.id}
                  task={{
                    id: t.id,
                    title: t.title,
                    done: t.status === "DONE",
                    dueDate: toYmd(t.dueDate),
                    assigneeUserId: t.assigneeUserId,
                    assigneeName: t.assigneeName,
                    assigneeLabel: t.assignee?.name ?? t.assigneeName ?? null,
                    property: t.property,
                    deal: t.deal,
                  }}
                  users={users}
                  properties={properties}
                  showAddress={showAddress}
                />
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {matchCount > PAGE && (
        <p className="mt-2 text-xs text-muted">
          Showing first {PAGE} of {matchCount}. Narrow the filters to see the rest.
        </p>
      )}
    </>
  );
}

export const dynamic = "force-dynamic";
