import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { everyTermMatches, searchTerms } from "@/lib/search";

export async function GET(request: NextRequest) {
  if (!(await getCurrentUser())) return NextResponse.json({ results: [] }, { status: 401 });
  const q = new URL(request.url).searchParams.get("q")?.trim();
  if (!q || q.length < 2) return NextResponse.json({ results: [] });
  const terms = searchTerms(q);
  if (terms.length === 0) return NextResponse.json({ results: [] });

  const [deals, properties, contacts, tasks] = await Promise.all([
    prisma.deal.findMany({
      where: everyTermMatches<Prisma.DealWhereInput>(terms, (t) => [{ address: t }]),
      select: { id: true, address: true, status: true },
      take: 6,
    }),
    prisma.property.findMany({
      where: everyTermMatches<Prisma.PropertyWhereInput>(terms, (t) => [{ address: t }]),
      select: { id: true, address: true },
      take: 6,
    }),
    prisma.contact.findMany({
      where: everyTermMatches<Prisma.ContactWhereInput>(terms, (t) => [
        { fullName: t },
        { company: t },
        { trades: t },
      ]),
      select: { id: true, fullName: true, company: true },
      take: 6,
    }),
    // A task matches on its own title or on what it's linked to: the property
    // or deal address, and whoever it's assigned to.
    prisma.task.findMany({
      where: everyTermMatches<Prisma.TaskWhereInput>(terms, (t) => [
        { title: t },
        { property: { address: t } },
        { deal: { address: t } },
        { assignee: { name: t } },
        { assigneeContact: { fullName: t } },
        { assigneeName: t },
      ]),
      select: { id: true, title: true, status: true },
      take: 6,
    }),
  ]);

  return NextResponse.json({
    results: [
      ...properties.map((p) => ({ type: "Property", id: p.id, label: p.address, href: `/properties/${p.id}` })),
      ...deals.map((d) => ({ type: "Deal", id: d.id, label: `${d.address} · ${d.status}`, href: `/deals/${d.id}` })),
      ...contacts.map((c) => ({
        type: "Contractor",
        id: c.id,
        label: [c.fullName, c.company].filter(Boolean).join(" · "),
        href: `/contractors/${c.id}`,
      })),
      ...tasks.map((t) => ({ type: "Task", id: t.id, label: t.title, href: `/tasks/${t.id}` })),
    ],
  });
}
