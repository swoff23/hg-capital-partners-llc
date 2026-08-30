import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Badge, Card, PageHeader, Table, Td, Th, EmptyState } from "@/components/ui";

export default async function ContractorsPage({ searchParams }: PageProps<"/contractors">) {
  await requireUser();
  const sp = (await searchParams) as { q?: string };
  const contacts = await prisma.contact.findMany({
    where: sp.q
      ? {
          OR: [
            { fullName: { contains: sp.q, mode: "insensitive" } },
            { company: { contains: sp.q, mode: "insensitive" } },
            { trades: { contains: sp.q, mode: "insensitive" } },
          ],
        }
      : {},
    orderBy: [{ active: "desc" }, { fullName: "asc" }],
  });

  return (
    <>
      <PageHeader title="Vendors" subtitle={`${contacts.length} contractors & service providers`} />
      <Card className="overflow-hidden">
        {contacts.length === 0 ? (
          <div className="p-4">
            <EmptyState>No vendors.</EmptyState>
          </div>
        ) : (
          <Table>
           <thead>
              <tr>
                <Th>Name</Th>
                <Th>Company</Th>
                <Th>Trades</Th>
                <Th>Phone</Th>
                <Th>Docs</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {contacts.map((c) => (
                <tr key={c.id} className="hover:bg-background">
                  <Td>
                    <Link href={`/contractors/${c.id}`} className="font-medium hover:underline">
                      {c.fullName}
                    </Link>
                    {c.tenantFixes && <Badge tone="green" className="ml-2">tenant fixes</Badge>}
                    {!c.active && <Badge tone="gray" className="ml-2">inactive</Badge>}
                  </Td>
                  <Td className="text-xs text-muted">{c.company ?? "—"}</Td>
                  <Td className="max-w-xs text-xs">{c.trades ?? "—"}</Td>
                  <Td className="whitespace-nowrap text-xs">{c.phone ?? "—"}</Td>
                  <Td className="text-xs">
                    {c.w9Url && <a href={c.w9Url} target="_blank" rel="noreferrer" className="text-primary">W-9</a>}
                    {c.w9Url && c.coiUrl && " · "}
                    {c.coiUrl && <a href={c.coiUrl} target="_blank" rel="noreferrer" className="text-primary">COI</a>}
                    {!c.w9Url && !c.coiUrl && "—"}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}

export const dynamic = "force-dynamic";
