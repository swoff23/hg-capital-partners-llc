import Link from "next/link";
import { Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { todayYmdEastern } from "@/lib/dates";
import { tenantPropertyOptions, tenantRows } from "@/lib/tenants/queries";
import { ScopeButton } from "@/components/filter-bar";
import { LinkPending } from "@/components/link-pending";
import { Money } from "@/components/money";
import { SortHeader } from "@/components/sort-header";
import { EmptyState, LinkButton, PageHeader, Table, Td, Th, chromeIconClass, pendingRowFill } from "@/components/ui";
import { cn } from "@/lib/utils";
import { TenantFilters } from "../filters";
import { LaunchLinks } from "./launch-links";
import {
  DEFAULT_TENANT_SORT,
  emptyTenants,
  inProperties,
  isNarrowed,
  parseTenantFilters,
  propertyCounts,
  sortTenants,
  tenantsCount,
} from "../query";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Tenants" };
// Email request links sends one email at a time, spaced for Resend (residents/service.ts): 51 take about 45 seconds.
export const maxDuration = 120;

/** An empty cell: the lone dash glyph in --muted-foreground (docs/brand-guidelines.md, section 3). */
const EMPTY = <span className="text-muted-foreground">—</span>;

export default async function TenantsPage({ searchParams }: PageProps<"/tenants">) {
  await requireUser();
  const f = parseTenantFilters(await searchParams);
  const today = todayYmdEastern();
  const narrowed = isNarrowed(f);
  // The view's whole is the count and what "hidden" is measured from; a search is the only thing that makes it a second read.
  const [searched, whole, options] = await Promise.all([
    tenantRows({ view: f.view, q: f.q }, today),
    f.q ? tenantRows({ view: f.view }, today) : null,
    tenantPropertyOptions(),
  ]);
  const total = (whole ?? searched).length;
  const rows = sortTenants(inProperties(searched, f.properties), f.sort);
  // Every property with a lease stays listed, counting the rows the search leaves.
  const counts = propertyCounts(searched);
  const properties = options.map((p) => ({ key: p.id, label: p.label, count: counts.get(p.id) ?? 0 }));
  const empty = emptyTenants(f, total);

  return (
    <>
      <PageHeader
        title="Tenants"
        subtitle={tenantsCount(total, f.view)}
        actions={
          <div className="flex items-center gap-2">
            <LaunchLinks />
            <LinkButton href="/tenants/new" variant="primary">
              <Plus aria-hidden="true" className={chromeIconClass} />
              New lease
            </LinkButton>
          </div>
        }
      />
      <TenantFilters data={{ properties, shown: rows.length, hidden: total - rows.length, filtered: narrowed }}>
        {rows.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              action={
                empty.clear === "search" ? (
                  <ScopeButton changes={{ q: null }}>Clear search</ScopeButton>
                ) : empty.clear === "filters" ? (
                  <ScopeButton clear>Clear filters</ScopeButton>
                ) : (
                  <LinkButton href="/tenants/new">New lease</LinkButton>
                )
              }
            >
              {empty.line}
            </EmptyState>
          </div>
        ) : (
          // Flat on the page, its first column on the gutter. Below sm a row is
          // the name over the home with the rent on the right; the Home and
          // Lease ends columns drop. Phone drops below lg, so a tablet keeps
          // its width for the rest.
          <Table className="mt-4">
            <thead>
              <tr>
                <SortHeader label="Name" field="name" defaultSort={DEFAULT_TENANT_SORT} className="pl-0" />
                <SortHeader label="Home" field="home" defaultSort={DEFAULT_TENANT_SORT} className="hidden sm:table-cell" />
                <SortHeader label="Rent" field="rent" defaultSort={DEFAULT_TENANT_SORT} first="desc" numeric className="pr-0 sm:pr-3" />
                <SortHeader label="Lease ends" field="ends" defaultSort={DEFAULT_TENANT_SORT} className="hidden pr-0 sm:table-cell lg:pr-3" />
                <Th className="hidden pr-0 lg:table-cell">Phone</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                // The whole row opens the lease, as the Contractors rows open theirs: one link covers it.
                <tr key={`${r.leaseId}:${r.tenantId}`} className={cn("relative transition-colors hover:bg-muted", pendingRowFill)}>
                  <Td className="pl-0 max-sm:w-full max-sm:max-w-0">
                    <Link href={`/tenants/${r.leaseId}`} className="absolute inset-0 -outline-offset-2">
                      <span className="sr-only">
                        {r.fullName}, {r.home}
                      </span>
                      <LinkPending />
                    </Link>
                    <span className="block truncate text-foreground">{r.fullName}</span>
                    <p className="mt-0.5 truncate text-meta text-muted-foreground sm:hidden">{r.home}</p>
                  </Td>
                  <Td className="hidden text-fg-2 sm:table-cell">{r.home}</Td>
                  <Td numeric className="pr-0 sm:pr-3">
                    {r.rent === null ? EMPTY : <Money value={r.rent} />}
                  </Td>
                  <Td className="hidden whitespace-nowrap pr-0 text-fg-2 sm:table-cell lg:pr-3">{r.leaseEnds}</Td>
                  <Td className="num hidden whitespace-nowrap pr-0 text-fg-2 lg:table-cell">{r.phone ?? EMPTY}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </TenantFilters>
    </>
  );
}

export const dynamic = "force-dynamic";
