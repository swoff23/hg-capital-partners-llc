import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  if (!(await getCurrentUser())) return NextResponse.json({ results: [] }, { status: 401 });
  const q = new URL(request.url).searchParams.get("q")?.trim();
  if (!q || q.length < 2) return NextResponse.json({ results: [] });

  const [deals, properties, contacts, tasks] = await Promise.all([
    prisma.deal.findMany({
      where: { address: { contains: q, mode: "insensitive" } },
      select: { id: true, address: true, status: true },
      take: 6,
    }),
    prisma.property.findMany({
      where: { address: { contains: q, mode: "insensitive" } },
      select: { id: true, address: true },
      take: 6,
    }),
    prisma.contact.findMany({
      where: {
        OR: [
          { fullName: { contains: q, mode: "insensitive" } },
          { company: { contains: q, mode: "insensitive" } },
          { trades: { contains: q, mode: "insensitive" } },
        ],
      },
      select: { id: true, fullName: true, company: true },
      take: 6,
    }),
    prisma.task.findMany({
      where: { title: { contains: q, mode: "insensitive" } },
      select: { id: true, title: true, status: true },
      take: 6,
    }),
  ]);

  return NextResponse.json({
    results: [
      ...properties.map((p) => ({ type: "Property", id: p.id, label: p.address, href: `/properties/${p.id}` })),
      ...deals.map((d) => ({ type: "Deal", id: d.id, label: `${d.address} · ${d.status}`, href: `/deals/${d.id}` })),
      ...contacts.map((c) => ({
        type: "Vendor",
        id: c.id,
        label: [c.fullName, c.company].filter(Boolean).join(" · "),
        href: `/contractors/${c.id}`,
      })),
      ...tasks.map((t) => ({ type: "Task", id: t.id, label: t.title, href: `/tasks/${t.id}` })),
    ],
  });
}
