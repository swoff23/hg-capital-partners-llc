import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, CardBody, CardHeader, CardTitle, PageHeader, EmptyState, TextLink } from "@/components/ui";
import { todayYmdEastern } from "@/lib/dates";
import { parseUnits, parseBuildingCapex } from "@/lib/property-types";
import { getCapexRules } from "@/lib/capex-rules";
import { ACTIVE_DEAL_STATUSES } from "@/lib/config";
import { activeTask, excludeTemplateTasks } from "@/lib/task-scope";
import { myOpenTasks } from "@/lib/tasks/queries";
import { PortfolioCapexForecastCard } from "./portfolio-capex";
import { MyTasksList } from "./tasks/my-tasks-list";
import { TaskListProvider } from "./tasks/task-list-context";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await requireUser();

  const [myTasks, counts, capexProps, capexRules] = await Promise.all([
    myOpenTasks(user.id, 12),
    Promise.all([
      prisma.deal.count({ where: { status: { in: ACTIVE_DEAL_STATUSES } } }),
      prisma.property.count(),
      prisma.task.count({ where: { ...activeTask, ...excludeTemplateTasks } }),
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
        <Stat label="Open tasks" value={openTasks} href="/tasks/all" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PortfolioCapexForecastCard properties={capexProperties} rules={capexRules} />

        <Card className="lg:col-span-2">
          <CardHeader className="flex items-center justify-between">
            <CardTitle>My open tasks</CardTitle>
            <TextLink href="/tasks" className="text-xs">
              Today
            </TextLink>
          </CardHeader>
          <CardBody className="p-0">
            {myTasks.length === 0 ? (
              <div className="p-4">
                <EmptyState>Nothing assigned to you. Nice.</EmptyState>
              </div>
            ) : (
              <TaskListProvider tasks={myTasks} today={todayYmdEastern()}>
                <MyTasksList />
              </TaskListProvider>
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
