import Link from "next/link";
import { railVerbClass } from "@/components/rail";
import { Money } from "@/components/money";
import { LinkButton, Section } from "@/components/ui";
import { Plus } from "lucide-react";
import type { Ymd } from "@/lib/dates";
import type { propertyTenants } from "@/lib/tenants/queries";
import { cn } from "@/lib/utils";
import { tenantQuery } from "../../tenants/query";
import { PastTenants } from "./past-tenants";
import { namesLine, nextLine, pastDetail, pastLine, vacantNextLine } from "./tenants-lines";

type Data = Awaited<ReturnType<typeof propertyTenants>>;

/**
 * Who lives where (docs/specs/tenants.md, section 5): one row per rentable
 * unit, and the past leases behind a button. A row opens its lease. From sm
 * it's four columns; on a phone the unit and rent share a line, the names sit
 * under it, and Lease ends is left to the lease page.
 */
export function TenantsSection({ propertyId, data, today }: { propertyId: string; data: Data; today: Ymd }) {
  const allHref = `/tenants?${tenantQuery({ q: "", view: "all", properties: [propertyId], sort: "home" })}`;
  // The list's Property filter only offers properties with a lease, so a property with none has nothing to open.
  const hasLeases = data.past.length > 0 || data.units.some((u) => u.living || u.next);
  return (
    <Section
      title="Tenants"
      actions={
        hasLeases && (
          <LinkButton href={allHref} variant="ghost" size="sm">
            All tenants
          </LinkButton>
        )
      }
    >
      <div aria-hidden="true" className="hidden grid-cols-[8rem_minmax(0,1fr)_6rem_7rem] gap-x-3 pb-1 text-meta text-muted-foreground sm:grid">
        <span>Unit</span>
        <span>Tenants</span>
        <span className="text-right">Rent</span>
        <span>Lease ends</span>
      </div>
      <ul className="divide-y divide-border">
        {data.units.map((u) => {
          const addHref = `/tenants/new?property=${propertyId}${u.unitId ? `&unit=${u.unitId}` : ""}`;
          // A vacant unit with a lease coming shows it in place of "Vacant"; the row opens that lease.
          const rowLease = u.living ?? u.next;
          const link = rowLease?.leaseId ?? null;
          return (
            <li
              key={u.unitId ?? "home"}
              className="group relative grid min-h-10 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 py-2 pointer-coarse:min-h-12 sm:grid-cols-[8rem_minmax(0,1fr)_6rem_7rem]"
            >
              {link && (
                <Link href={`/tenants/${link}`} className="absolute inset-0 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                  <span className="sr-only">{`${u.label}, ${namesLine(rowLease?.names ?? [])}`}</span>
                </Link>
              )}
              <span className={cn("pointer-events-none col-start-1 row-start-1 truncate text-body text-foreground underline-offset-3", link && "group-hover:underline")}>
                {u.label}
              </span>
              {u.living ? (
                <>
                  <span className="pointer-events-none col-span-2 row-start-2 min-w-0 truncate text-meta text-fg-2 sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:text-body sm:text-foreground">
                    {namesLine(u.living.names)}
                  </span>
                  <span className="pointer-events-none col-start-2 row-start-1 text-right text-body text-foreground sm:col-start-3">
                    <Money value={u.living.rent} />
                  </span>
                  <span className={cn("pointer-events-none hidden truncate text-meta sm:block", u.living.leaseEnds === "—" ? "text-muted-foreground" : "text-fg-2")}>
                    {u.living.leaseEnds}
                  </span>
                  {u.next && (
                    // Its own link, above the row's overlay, so the upcoming household opens its own lease.
                    <Link
                      href={`/tenants/${u.next.leaseId}`}
                      className="relative col-span-2 row-start-3 min-w-0 truncate rounded-sm text-meta text-muted-foreground underline-offset-3 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring sm:col-span-3 sm:col-start-2 sm:row-start-2"
                    >
                      {nextLine(u.next.names, u.next.movesIn, today)}
                    </Link>
                  )}
                </>
              ) : u.next ? (
                <span className="pointer-events-none col-span-2 row-start-2 min-w-0 truncate text-body text-fg-2 sm:col-span-3 sm:col-start-2 sm:row-start-1">
                  {vacantNextLine(u.next.names, u.next.movesIn, today)}
                </span>
              ) : (
                // On a phone the verb takes the rent's place on the unit's line and "Vacant" sits under it; from sm they share the names column.
                <div className="contents sm:col-span-3 sm:col-start-2 sm:row-start-1 sm:flex sm:min-w-0 sm:items-center sm:gap-3">
                  <span className="col-span-2 row-start-2 text-meta text-muted-foreground sm:text-body">Vacant</span>
                  <Link href={addHref} className={cn(railVerbClass(), "relative col-start-2 row-start-1 justify-self-end")}>
                    <Plus aria-hidden="true" strokeWidth={1.75} className="h-4 w-4 shrink-0" />
                    Add tenants
                    <span className="sr-only"> for {u.label}</span>
                  </Link>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <PastTenants items={data.past.map((p) => ({ leaseId: p.leaseId, line: pastLine(p), names: namesLine(p.names), detail: pastDetail(p) }))} />
    </Section>
  );
}
