import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Badge, Card, PageHeader, Table, Td, Th, EmptyState, textLinkClass } from "@/components/ui";
import { cleanTrades, telHref } from "@/lib/contacts";
import { ContactLink } from "./contact-link";

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
      <PageHeader title="Contractors" subtitle={`${contacts.length} contractor${contacts.length === 1 ? "" : "s"}`} />
      <Card className="overflow-clip">
        {contacts.length === 0 ? (
          <div className="p-4">
            <EmptyState>No contractors.</EmptyState>
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
                    {c.tenantFixes && <Badge className="ml-2">tenant fixes</Badge>}
                    {!c.active && <Badge tone="neutral" className="ml-2">inactive</Badge>}
                  </Td>
                  <Td className="text-xs text-muted">{c.company ?? "—"}</Td>
                  <Td className="max-w-xs text-xs">{cleanTrades(c.trades) ?? "—"}</Td>
                  <Td className="num whitespace-nowrap text-xs">
                    <ContactLink href={telHref(c.phoneE164 ?? c.phone)}>{c.phone ?? "—"}</ContactLink>
                  </Td>
                  <Td className="text-xs">
                    {c.w9Url && <a href={c.w9Url} target="_blank" rel="noreferrer" className={textLinkClass}>W-9</a>}
                    {c.w9Url && c.coiUrl && " · "}
                    {c.coiUrl && <a href={c.coiUrl} target="_blank" rel="noreferrer" className={textLinkClass}>COI</a>}
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
