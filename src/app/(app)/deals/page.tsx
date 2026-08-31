import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, LinkButton, PageHeader, Table, Th, EmptyState } from "@/components/ui";
import { DealFilters } from "./filters";
import { DealRowEditable } from "./deal-row";

type SP = { status?: string; q?: string };

export default async function DealsPage({ searchParams }: PageProps<"/deals">) {
  await requireUser();
  const sp = (await searchParams) as SP;

  const statusFilter = sp.status ?? "active";
  const where = {
    ...(statusFilter === "all"
      ? {}
      : statusFilter === "active"
        ? { status: { notIn: ["Pass", "CLOSED!"] } }
        : { status: statusFilter }),
    ...(sp.q ? { address: { contains: sp.q, mode: "insensitive" as const } } : {}),
  };

  const [deals, total, statusCounts] = await Promise.all([
    prisma.deal.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: 300,
    }),
    prisma.deal.count(),
    prisma.deal.groupBy({ by: ["status"], _count: true }),
  ]);

  return (
    <>
      <PageHeader
        title="Acquisitions"
        subtitle={`${total} deals in the CRM`}
        actions={
          <LinkButton href="/deals/new" variant="primary">
            + New deal
          </LinkButton>
        }
      />

      <DealFilters
        statusCounts={Object.fromEntries(statusCounts.map((s) => [s.status, s._count]))}
        current={{ status: statusFilter, q: sp.q ?? "" }}
      />

      <Card className="mt-4 overflow-hidden">
        {deals.length === 0 ? (
          <div className="p-4">
            <EmptyState>No deals match.</EmptyState>
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Address</Th>
                <Th>Status</Th>
                <Th className="text-right">Their price</Th>
                <Th className="text-right">Our price</Th>
                <Th>Next action</Th>
                <Th>Updated</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {deals.map((d) => (
                <DealRowEditable
                  key={d.id}
                  deal={{
                    id: d.id,
                    address: d.address,
                    status: d.status,
                    theirPrice: d.theirPrice ? Number(d.theirPrice) : null,
                    theirPriceRaw: d.theirPriceRaw,
                    ourPrice: d.ourPrice ? Number(d.ourPrice) : null,
                    ourPriceRaw: d.ourPriceRaw,
                    nextAction: d.nextAction,
                    sourceUrl: d.sourceUrl,
                    updatedAt: d.updatedAt.toISOString(),
                  }}
                />
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {deals.length === 300 && (
        <p className="mt-2 text-xs text-muted">Showing first 300. Use the address filter to narrow.</p>
      )}
    </>
  );
}

export const dynamic = "force-dynamic";
