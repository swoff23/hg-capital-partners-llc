import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ScopeButton } from "@/components/filter-bar";
import { Badge, PageHeader, Table, Td, Th, EmptyState, pendingRowFill, textLinkClass } from "@/components/ui";
import { LinkPending } from "@/components/link-pending";
import { TagOverflow } from "@/components/tags-field";
import { docOnFile, telHref } from "@/lib/contacts";
import { TRADE_LINKS, tradeLine, tradeNames } from "@/lib/contractors/trades";
import { cn } from "@/lib/utils";
import { ContactLink } from "../contact-link";
import { ContractorFilters } from "../filters";
import { ContractorHeaderActions } from "../invite-sheet";
import { OnboardingBadge } from "../status-badge";
import {
  contractorsCount,
  contractorScope,
  contractorsWhere,
  emptyContractors,
  isNarrowed,
  matchesNeedsW9,
  matchesStatus,
  matchesTrades,
  STATUS_INCLUDE,
  statusOf,
  parseContractorFilters,
  contractorQuery,
  resolveTradePicks,
  tradeOptions,
} from "../query";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Contractors" };

/** An empty cell: the lone dash glyph in --muted-foreground (docs/brand-guidelines.md, section 3). */
const EMPTY = <span className="text-muted-foreground">—</span>;

/** A document link in the Docs column. It sits above the row's link, so a click opens the file. */
const docLink = cn(textLinkClass, "relative");

export default async function ContractorsPage({ searchParams }: PageProps<"/contractors">) {
  await requireUser();
  const f = parseContractorFilters(await searchParams);
  const [searched, total, allTrades] = await Promise.all([
    prisma.contact.findMany({
      where: contractorsWhere(f),
      orderBy: [{ active: "desc" }, { fullName: "asc" }],
      include: {
        tradeLinks: TRADE_LINKS,
        // The newest of each kind opens in the Docs column.
        documents: { select: { id: true, kind: true }, orderBy: { createdAt: "desc" } },
        ...STATUS_INCLUDE,
      },
    }),
    // The list's whole, for the count: the archived contractors under Archived, the rest otherwise.
    prisma.contact.count({ where: contractorScope(f) }),
    prisma.trade.findMany({ select: { id: true, name: true } }),
  ]);
  // A link from before trades were a list names them ("?trade=Plumbing"): the same list, by id, so the checklist shows the pick.
  const picks = resolveTradePicks(f.trades, allTrades);
  if (picks.join(",") !== f.trades.join(",")) redirect(`/contractors?${contractorQuery({ ...f, trades: picks })}`);
  // A W-9 can be named in the notes, so "Needs W-9" reads on the rows, and so does the Trade filter, whose counts come from the rest (query.ts).
  // The onboarding Status filter reads the same badge the rows show (statusOf), so it's on the rows too.
  const found = searched.filter((c) => matchesNeedsW9(c, f) && matchesStatus(c, f.status));
  const contacts = found.filter((c) => matchesTrades(c, f.trades));
  // Every trade stays listed, counting the contractors the search and the other filters leave.
  const trades = tradeOptions(allTrades, found);
  const narrowed = isNarrowed(f);
  const empty = emptyContractors(f, total);

  return (
    <>
      <PageHeader
        title="Contractors"
        // The whole list, filtered or not: the result line under the filters says "2 contractors · 28 hidden".
        // Under Archived the whole is the archived ones: "2 archived".
        subtitle={contractorsCount(total, f.archived)}
        // Invite contractor is the one primary; the invite sheet's "Add without inviting" is the way to New contractor.
        actions={<ContractorHeaderActions />}
      />
      <ContractorFilters data={{ trades, shown: contacts.length, hidden: total - contacts.length, filtered: narrowed || f.archived }}>
        {contacts.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              action={
                empty.clear === "search" ? (
                  <ScopeButton changes={{ q: null }}>Clear search</ScopeButton>
                ) : empty.clear === "filters" ? (
                  <ScopeButton clear>Clear filters</ScopeButton>
                ) : undefined
              }
            >
              {empty.line}
            </EmptyState>
          </div>
        ) : (
          // Flat on the page, its first column on the gutter (section 5). Below
          // sm a row keeps two lines: the name over company and trades, with the
          // phone beside it; the company, trades and docs columns drop. The
          // Status column shows from md (a tablet); narrower, the status badge
          // sits by the name, leading the subline on a phone.
          <Table className="mt-4">
            <thead>
              <tr>
                <Th className="pl-0">Name</Th>
                <Th className="hidden sm:table-cell">Company</Th>
                {/* A share of the width: the tags take what the column has and end in "+2", never widen it.
                    A quarter from md to lg, so the name keeps its room beside the Status column on a tablet. */}
                <Th className="hidden w-1/3 sm:table-cell md:w-1/4 lg:w-1/3">Trades</Th>
                <Th className="pr-0 sm:pr-3">Phone</Th>
                <Th className="hidden pr-0 sm:table-cell md:pr-3">Docs</Th>
                {/* The onboarding status, named as the Status filter is; the last column, as on Properties. */}
                <Th className="hidden pr-0 md:table-cell">Status</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {contacts.map((c) => {
                const names = tradeNames(c.tradeLinks);
                const subline = [c.company, tradeLine(c.tradeLinks)].filter(Boolean).join(" · ");
                const status = statusOf(c);
                const statusBadge = status && <OnboardingBadge status={status} className="shrink-0" />;
                // Traits stay beside the name; the onboarding status has its own column from md.
                const traits = (c.tenantFixes || !c.active) && (
                  <>
                    {c.tenantFixes && <Badge className="shrink-0">Tenant fixes</Badge>}
                    {!c.active && <Badge className="shrink-0">Inactive</Badge>}
                  </>
                );
                // A doc on file only by filename (the import's notes) still counts,
                // as it does on the contractor's page; it just has no link, so it
                // reads in --muted-foreground and a link always looks different from plain text.
                // An uploaded file opens first (the files route, private to staff), then an old Drive link.
                const w9Upload = c.documents.find((d) => d.kind === "W9");
                const coiUpload = c.documents.find((d) => d.kind === "INSURANCE");
                const w9Href = w9Upload ? `/api/files/contact/${w9Upload.id}` : c.w9Url;
                const coiHref = coiUpload ? `/api/files/contact/${coiUpload.id}` : c.coiUrl;
                const w9 = w9Href ? (
                  <a href={w9Href} target="_blank" rel="noreferrer" className={docLink}>
                    W-9
                  </a>
                ) : docOnFile(c.comments, "W-9") ? (
                  <span className="text-muted-foreground">W-9</span>
                ) : null;
                const coi = coiHref ? (
                  <a href={coiHref} target="_blank" rel="noreferrer" className={docLink}>
                    COI
                  </a>
                ) : docOnFile(c.comments, "Insurance") ? (
                  <span className="text-muted-foreground">COI</span>
                ) : null;
                return (
                  // The whole row opens the contractor, as TaskRow does: one link
                  // covers the row, and the phone and document links sit above it.
                  <tr key={c.id} className={cn("relative transition-colors hover:bg-muted", pendingRowFill)}>
                    <Td className="pl-0 max-sm:w-full max-sm:max-w-0">
                      <Link href={`/contractors/${c.id}`} className="absolute inset-0 -outline-offset-2">
                        <span className="sr-only">{c.fullName}</span>
                        <LinkPending />
                      </Link>
                      {/* From sm the name keeps its longest word and the badges drop under it when the
                          column is narrow (a tablet), so a badge never sits on the name. The status
                          badge joins them only from sm to md, before the Status column shows. */}
                      <div className="flex min-w-0 items-center gap-x-2 gap-y-1 sm:flex-wrap">
                        <span className="text-foreground max-sm:min-w-0 max-sm:truncate">{c.fullName}</span>
                        {(status || traits) && (
                          <span className={cn("hidden shrink-0 items-center gap-2 sm:flex", !traits && "md:hidden")}>
                            {status && <OnboardingBadge status={status} className="shrink-0 md:hidden" />}
                            {traits}
                          </span>
                        )}
                      </div>
                      {/* On a phone the name keeps the first line; the status and traits lead the subline. */}
                      {(statusBadge || traits || subline) && (
                        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 sm:hidden">
                          {statusBadge}
                          {traits}
                          {subline && <p className="min-w-0 truncate text-meta text-muted-foreground">{subline}</p>}
                        </div>
                      )}
                    </Td>
                    <Td className="hidden text-fg-2 sm:table-cell">{c.company ?? EMPTY}</Td>
                    <Td className="hidden sm:table-cell">{names.length > 0 ? <TagOverflow tags={names} /> : EMPTY}</Td>
                    <Td className="num whitespace-nowrap pr-0 sm:pr-3">
                      {c.phone ? (
                        <ContactLink href={telHref(c.phoneE164 ?? c.phone)} className="relative">
                          {c.phone}
                        </ContactLink>
                      ) : (
                        EMPTY
                      )}
                    </Td>
                    <Td className="hidden whitespace-nowrap pr-0 text-fg-2 sm:table-cell md:pr-3">
                      {w9}
                      {w9 && coi && " · "}
                      {coi}
                      {!w9 && !coi && EMPTY}
                    </Td>
                    {/* Active, or never in setup, is the empty dash. */}
                    <Td className="hidden whitespace-nowrap pr-0 md:table-cell">{statusBadge || EMPTY}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </ContractorFilters>
    </>
  );
}

export const dynamic = "force-dynamic";
