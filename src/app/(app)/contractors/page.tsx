import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Badge, PageHeader, Table, Td, Th, EmptyState, textLinkClass } from "@/components/ui";
import { cleanTrades, docOnFile, telHref } from "@/lib/contacts";
import { cn } from "@/lib/utils";
import { ContactLink } from "./contact-link";

/** An empty cell: the lone dash glyph in --fg-3 (docs/brand-guidelines.md, section 3). */
const EMPTY = <span className="text-fg-3">—</span>;

/** A document link in the Docs column. It sits above the row's link, so a click opens the file. */
const docLink = cn(textLinkClass, "relative");

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
      {contacts.length === 0 ? (
        <EmptyState>No contractors.</EmptyState>
      ) : (
        // Flat on the page, its first column on the gutter (section 5). Below
        // sm a row keeps two lines: the name over company and trades, with the
        // phone beside it; the company, trades and docs columns drop.
        <Table>
          <thead>
            <tr>
              <Th className="pl-0">Name</Th>
              <Th className="hidden sm:table-cell">Company</Th>
              <Th className="hidden sm:table-cell">Trades</Th>
              <Th className="pr-0 sm:pr-3">Phone</Th>
              <Th className="hidden pr-0 sm:table-cell">Docs</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {contacts.map((c) => {
              const trades = cleanTrades(c.trades);
              const subline = [c.company, trades].filter(Boolean).join(" · ");
              const badges = (c.tenantFixes || !c.active) && (
                <>
                  {c.tenantFixes && <Badge className="shrink-0">Tenant fixes</Badge>}
                  {!c.active && <Badge className="shrink-0">Inactive</Badge>}
                </>
              );
              // A doc on file only by filename (the import's notes) still counts,
              // as it does on the contractor's page; it just has no link.
              const w9 = c.w9Url ? (
                <a href={c.w9Url} target="_blank" rel="noreferrer" className={docLink}>
                  W-9
                </a>
              ) : docOnFile(c.comments, "W-9") ? (
                "W-9"
              ) : null;
              const coi = c.coiUrl ? (
                <a href={c.coiUrl} target="_blank" rel="noreferrer" className={docLink}>
                  COI
                </a>
              ) : docOnFile(c.comments, "Insurance") ? (
                "COI"
              ) : null;
              return (
                // The whole row opens the contractor, as TaskRow does: one link
                // covers the row, and the phone and document links sit above it.
                <tr key={c.id} className="relative transition-colors hover:bg-fill-1">
                  <Td className="pl-0 max-sm:w-full max-sm:max-w-0">
                    <Link href={`/contractors/${c.id}`} className="absolute inset-0 -outline-offset-2">
                      <span className="sr-only">{c.fullName}</span>
                    </Link>
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="min-w-0 text-fg-1 max-sm:truncate">{c.fullName}</span>
                      {badges && <span className="hidden shrink-0 items-center gap-2 sm:flex">{badges}</span>}
                    </div>
                    {/* On a phone the name keeps the first line; the badges lead the subline. */}
                    {(badges || subline) && (
                      <div className="mt-0.5 flex min-w-0 items-center gap-1.5 sm:hidden">
                        {badges}
                        {subline && <p className="min-w-0 truncate text-meta text-fg-3">{subline}</p>}
                      </div>
                    )}
                  </Td>
                  <Td className="hidden text-fg-2 sm:table-cell">{c.company ?? EMPTY}</Td>
                  <Td className="hidden max-w-xs text-fg-2 sm:table-cell">{trades ?? EMPTY}</Td>
                  <Td className="num whitespace-nowrap pr-0 sm:pr-3">
                    {c.phone ? (
                      <ContactLink href={telHref(c.phoneE164 ?? c.phone)} className="relative">
                        {c.phone}
                      </ContactLink>
                    ) : (
                      EMPTY
                    )}
                  </Td>
                  <Td className="hidden whitespace-nowrap pr-0 text-fg-2 sm:table-cell">
                    {w9}
                    {w9 && coi && " · "}
                    {coi}
                    {!w9 && !coi && EMPTY}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </>
  );
}

export const dynamic = "force-dynamic";
