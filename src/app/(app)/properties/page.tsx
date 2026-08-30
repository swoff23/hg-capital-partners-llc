import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Badge, Card, PageHeader, Table, Td, Th, EmptyState } from "@/components/ui";
import { fmtMoney } from "@/lib/utils";
import { propertyStatusTone } from "@/lib/config";

export default async function PropertiesPage() {
  await requireUser();
  const properties = await prisma.property.findMany({
    orderBy: { address: "asc" },
    include: { _count: { select: { tasks: true } } },
  });

  const openByProp = await prisma.task.groupBy({
    by: ["propertyId"],
    where: { status: "OPEN", propertyId: { not: null } },
    _count: true,
  });
  const openMap = new Map(openByProp.map((r) => [r.propertyId, r._count]));

  const totals = properties.reduce(
    (acc, p) => {
      acc.units += p.unitCount ?? 0;
      acc.purchase += Number(p.purchasePrice ?? 0);
      acc.value += Number(p.value ?? 0);
      acc.openTasks += openMap.get(p.id) ?? 0;
      return acc;
    },
    { units: 0, purchase: 0, value: 0, openTasks: 0 },
  );

  return (
    <>
      <PageHeader title="Portfolio" subtitle={`${properties.length} owned properties`} />
      <Card className="overflow-hidden">
        {properties.length === 0 ? (
          <div className="p-4">
            <EmptyState>No properties.</EmptyState>
          </div>
        ) : (
          <Table>
           <thead>
              <tr>
                <Th>Address</Th>
                <Th>Entity</Th>
                <Th>Status</Th>
                <Th>Open tasks</Th>
                <Th>Units</Th>
                <Th>Purchase</Th>
                <Th>Value</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {properties.map((p) => (
                <tr key={p.id} className="hover:bg-background">
                  <Td>
                    <Link href={`/properties/${p.id}`} className="font-medium hover:underline">
                      {p.address}
                    </Link>
                  </Td>
                  <Td className="text-xs text-muted">{p.llcOwner ?? "—"}</Td>
                  <Td>{p.status ? <Badge tone={propertyStatusTone(p.status)}>{p.status}</Badge> : "—"}</Td>
                  <Td className="tabular-nums">{openMap.get(p.id) ?? 0}</Td>
                  <Td className="tabular-nums">{p.unitCount ?? "—"}</Td>
                  <Td className="tabular-nums">{fmtMoney(p.purchasePrice)}</Td>
                  <Td className="tabular-nums">{fmtMoney(p.value)}</Td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border font-semibold">
                <Td>Total</Td>
                <Td />
                <Td />
                <Td className="tabular-nums">{totals.openTasks}</Td>
                <Td className="tabular-nums">{totals.units}</Td>
                <Td className="tabular-nums">{fmtMoney(totals.purchase)}</Td>
                <Td className="tabular-nums">{fmtMoney(totals.value)}</Td>
              </tr>
            </tfoot>
          </Table>
        )}
      </Card>
    </>
  );
}

export const dynamic = "force-dynamic";
