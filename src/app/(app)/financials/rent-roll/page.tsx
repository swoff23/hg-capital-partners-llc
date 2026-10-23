import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Card, CardBody, EmptyState, Table, Td, Th, TextLink } from "@/components/ui";
import { getRentRoll } from "@/lib/quickbooks/queries";
import { basisFromParam } from "@/lib/quickbooks/rollup";
import { fmtCents, PartialLabel, SandboxNotice, SourceBadge } from "../_components/ui";

export const dynamic = "force-dynamic";

export default async function RentRollPage({ searchParams }: PageProps<"/financials/rent-roll">) {
  await requireUser(); // here as well as in the layout, which doesn't gate every render
  const sp = await searchParams;
  // ?basis= is a one-off override; without it the basis chosen in Settings applies
  const roll = await getRentRoll(basisFromParam(sp.basis));

  if (!roll || !roll.connected) {
    return (
      <Card>
        <CardBody>
          <EmptyState>Connect QuickBooks to see the rent roll.</EmptyState>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <SourceBadge basis={roll.basis} syncedAt={roll.lastSyncAt} />

      {roll.sandbox && <SandboxNotice />}

      <p className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted">
        {roll.basis === "CASH" ? (
          <>
            Cash rent <strong>received</strong>
          </>
        ) : (
          <>
            Rent <strong>earned</strong>
          </>
        )}{" "}
        by month, summed across every class mapped to the property so an entity transfer on
        refinance shows no gap. No lease data yet, so scheduled/market rent, delinquency, and
        vacancy are out of scope. Section-8 / voucher rent is included; owner P2P deposits
        mis-booked to Rents are excluded and shown separately.
      </p>

      {roll.rows.length === 0 ? (
        // never a $0 Portfolio total over zero rows
        <Card>
          <CardBody>
            <EmptyState>
              {roll.months.length > 0 ? (
                <>
                  No rent is matched to a property yet.{" "}
                  <TextLink href="/financials/settings#class-mapping">Map QuickBooks classes</TextLink>
                </>
              ) : (
                <>
                  No rent in the synced QuickBooks data.{" "}
                  <TextLink href="/financials/settings#account-categories">Check account categories</TextLink>
                </>
              )}
            </EmptyState>
          </CardBody>
        </Card>
      ) : (
        <Card className="overflow-clip">
          <Table>
            <thead>
              <tr>
                <Th>Property</Th>
                {roll.months.map((m) => (
                  <Th key={m} numeric>
                    {m.slice(2)}
                  </Th>
                ))}
                <Th numeric>Total</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {roll.rows.map((r) => (
                <tr key={r.propertyId} className="hover:bg-background">
                  <Td>
                    <Link
                      href={`/properties/${r.propertyId}`}
                      className="font-medium hover:underline"
                    >
                      {r.address}
                    </Link>
                    <PartialLabel months={r.monthsOfData} />
                    {(r.subsidyCents > 0 || r.ownerFundedCents > 0) && (
                      <div className="text-[11px] text-muted">
                        {r.subsidyCents > 0 && <>voucher {fmtCents(r.subsidyCents)}</>}
                        {r.subsidyCents > 0 && r.ownerFundedCents > 0 && " · "}
                        {r.ownerFundedCents > 0 && (
                          <span className="text-amber-700 dark:text-amber-500">
                            owner-funded {fmtCents(r.ownerFundedCents)} (excl.)
                          </span>
                        )}
                      </div>
                    )}
                  </Td>
                  {roll.months.map((m) => (
                    <Td key={m} numeric>
                      {r.byMonth[m] ? fmtCents(r.byMonth[m]) : <span className="text-muted">—</span>}
                    </Td>
                  ))}
                  <Td numeric className="font-medium">{fmtCents(r.totalCents)}</Td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border font-semibold">
                <Td>Portfolio</Td>
                {roll.months.map((m) => (
                  <Td key={m} numeric>
                    {fmtCents(roll.portfolioByMonth[m] ?? 0)}
                  </Td>
                ))}
                <Td numeric>
                  {fmtCents(
                    Object.values(roll.portfolioByMonth).reduce((a, b) => a + b, 0),
                  )}
                </Td>
              </tr>
            </tfoot>
          </Table>
        </Card>
      )}
    </div>
  );
}
