import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { dealStatusLabel } from "@/lib/config";
import { prisma } from "@/lib/db";
import { everyTermMatches, searchTerms } from "@/lib/search";
import { paletteTaskWhere } from "@/lib/tasks/list-query";

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
    // The Tasks page's search (paletteTaskWhere): the same words over the same fields, Template rows left out on both.
    prisma.task.findMany({
      where: paletteTaskWhere(q),
      select: { id: true, title: true, status: true },
      take: 6,
    }),
  ]);

  return NextResponse.json({
    results: [
      ...properties.map((p) => ({ type: "Property", id: p.id, label: p.address, href: `/properties/${p.id}` })),
      ...deals.map((d) => ({ type: "Deal", id: d.id, label: `${d.address} · ${dealStatusLabel(d.status)}`, href: `/deals/${d.id}` })),
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
