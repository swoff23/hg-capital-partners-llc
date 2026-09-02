import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, CardBody, CardHeader, CardTitle, PageHeader, EmptyState } from "@/components/ui";
import { isPastDay, relativeDays } from "@/lib/dates";
import { shortAddress } from "@/lib/normalize";
import { parseUnits, parseBuildingCapex } from "@/lib/property-types";
import { getCapexRules } from "@/lib/capex-rules";
import { ACTIVE_DEAL_STATUSES } from "@/lib/config";
import { excludeTemplateTasks } from "@/lib/task-scope";
import { PortfolioCapexForecastCard } from "./portfolio-capex";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await requireUser();

  const [myTasks, counts, capexProps, capexRules] = await Promise.all([
    prisma.task.findMany({
      where: { assigneeUserId: user.id, status: "OPEN", ...excludeTemplateTasks },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      take: 12,
      include: { property: { select: { id: true, address: true } } },
    }),
    Promise.all([
      prisma.deal.count({ where: { status: { in: ACTIVE_DEAL_STATUSES } } }),
      prisma.property.count(),
      prisma.task.count({ where: { status: "OPEN", ...excludeTemplateTasks } }),
    ]),
    prisma.property.findMany({
      select: { id: true, address: true, units: true, buildingCapex: true },
    }),
    getCapexRules(),
  ]);

  const [activeDeals, properties, openTasks] = counts;
  const capexProperties = capexProps.map((p) => ({
    id: p.id,
    address: p.address,
    units: parseUnits(p.units),
    building: parseBuildingCapex(p.buildingCapex),
  }));

  return (
    <>
      <PageHeader title={`Good ${greeting()}, ${user.name?.split(" ")[0] ?? "there"}`} subtitle="What needs attention" />

      <div className="mb-6 grid grid-cols-3 gap-3">
        <Stat label="Active deals" value={activeDeals} href="/deals" />
        <Stat label="Properties" value={properties} href="/properties" />
        <Stat label="Open tasks" value={openTasks} href="/tasks" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PortfolioCapexForecastCard properties={capexProperties} rules={capexRules} />

        <Card className="lg:col-span-2">
          <CardHeader className="flex items-center justify-between">
            <CardTitle>My open tasks</CardTitle>
            <Link href="/tasks?assignee=me" className="text-xs text-primary">
              View all
            </Link>
          </CardHeader>
          <CardBody className="p-0">
            {myTasks.length === 0 ? (
              <div className="p-4">
                <EmptyState>Nothing assigned to you. Nice.</EmptyState>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {myTasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 px-4 py-2.5 text-sm">
                    <Link href={`/tasks/${t.id}`} className="min-w-0 flex-1 truncate hover:underline">
                      {t.title}
                    </Link>
                    {t.property && (
                      <Link
                        href={`/properties/${t.property.id}`}
                        className="hidden shrink-0 text-xs text-muted hover:underline sm:block"
                      >
                        {shortAddress(t.property.address)}
                      </Link>
                    )}
                    {t.dueDate && (
                      <span
                        className={`shrink-0 text-xs ${isPastDay(t.dueDate) ? "text-red-600" : "text-muted"}`}
                      >
                        {relativeDays(t.dueDate)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function Stat({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link href={href}>
      <Card className="transition-colors hover:border-primary/40">
        <CardBody className="p-3">
          <div className="text-2xl font-semibold tabular-nums">{value}</div>
          <div className="text-xs text-muted">{label}</div>
        </CardBody>
      </Card>
    </Link>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
}
