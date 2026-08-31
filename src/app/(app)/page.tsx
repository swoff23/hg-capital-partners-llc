import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Badge, Card, CardBody, CardHeader, CardTitle, PageHeader, EmptyState } from "@/components/ui";
import { fmtDate, relativeDays } from "@/lib/utils";
import { dealStatusTone } from "@/lib/config";
import { parseUnits, parseBuildingCapex } from "@/lib/property-types";
import { getCapexRules } from "@/lib/capex-rules";
import { PortfolioCapexForecastCard } from "./portfolio-capex";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await requireUser();

  const [myTasks, dealsDue, counts, recentNotes, capexProps, capexRules] = await Promise.all([
    prisma.task.findMany({
      where: { assigneeUserId: user.id, status: "OPEN" },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      take: 12,
      include: { property: { select: { id: true, address: true } } },
    }),
    prisma.deal.findMany({
      where: { status: { notIn: ["Pass", "Lost", "Closed"] }, nextActionDue: { not: null } },
      orderBy: { nextActionDue: "asc" },
      take: 10,
    }),
    Promise.all([
      prisma.deal.count({ where: { status: { notIn: ["Pass", "Lost"] } } }),
      prisma.property.count(),
      prisma.task.count({ where: { status: "OPEN" } }),
      prisma.contact.count({ where: { active: true } }),
    ]),
    prisma.dealNote.findMany({
      orderBy: { noteDate: "desc" },
      where: { noteDate: { not: null } },
      take: 8,
      include: { deal: { select: { id: true, address: true } } },
    }),
    prisma.property.findMany({
      select: { id: true, address: true, units: true, buildingCapex: true },
    }),
    getCapexRules(),
  ]);

  const [activeDeals, properties, openTasks, vendors] = counts;
  const capexProperties = capexProps.map((p) => ({
    id: p.id,
    address: p.address,
    units: parseUnits(p.units),
    building: parseBuildingCapex(p.buildingCapex),
  }));

  return (
    <>
      <PageHeader title={`Good ${greeting()}, ${user.name?.split(" ")[0] ?? "there"}`} subtitle="What needs attention" />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Active deals" value={activeDeals} href="/deals" />
        <Stat label="Properties" value={properties} href="/properties" />
        <Stat label="Open tasks" value={openTasks} href="/tasks" />
        <Stat label="Vendors" value={vendors} href="/contractors" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PortfolioCapexForecastCard properties={capexProperties} rules={capexRules} />

        <Card>
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
                        {shortAddr(t.property.address)}
                      </Link>
                    )}
                    {t.dueDate && (
                      <span
                        className={`shrink-0 text-xs ${new Date(t.dueDate) < new Date() ? "text-red-600" : "text-muted"}`}
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

        <Card>
          <CardHeader>
            <CardTitle>Deals with a next action due</CardTitle>
          </CardHeader>
          <CardBody className="p-0">
            {dealsDue.length === 0 ? (
              <div className="p-4">
                <EmptyState>No deal next-actions scheduled.</EmptyState>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {dealsDue.map((d) => (
                  <li key={d.id} className="px-4 py-2.5 text-sm">
                    <div className="flex items-center gap-2">
                      <Link href={`/deals/${d.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">
                        {d.address}
                      </Link>
                      <Badge tone={dealStatusTone(d.status)}>{d.status}</Badge>
                      <span
                        className={`shrink-0 text-xs ${d.nextActionDue && new Date(d.nextActionDue) < new Date() ? "text-red-600" : "text-muted"}`}
                      >
                        {relativeDays(d.nextActionDue)}
                      </span>
                    </div>
                    {d.nextAction && <p className="mt-0.5 truncate text-xs text-muted">{d.nextAction}</p>}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent acquisition activity</CardTitle>
          </CardHeader>
          <CardBody className="p-0">
            <ul className="divide-y divide-border">
              {recentNotes.map((n) => (
                <li key={n.id} className="flex gap-3 px-4 py-2.5 text-sm">
                  <span className="w-20 shrink-0 text-xs text-muted">{fmtDate(n.noteDate)}</span>
                  <Link href={`/deals/${n.deal.id}`} className="w-40 shrink-0 truncate text-xs font-medium hover:underline">
                    {shortAddr(n.deal.address)}
                  </Link>
                  <span className="min-w-0 flex-1 truncate text-muted">{n.body}</span>
                </li>
              ))}
            </ul>
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
function shortAddr(a: string) {
  return a.split(",")[0].replace(/\s+(buffalo|ny).*/i, "").trim();
}
