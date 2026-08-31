import Link from "next/link";
import type { QboBasis } from "@prisma/client";
import { Card, CardBody, EmptyState, Table, Td, Th } from "@/components/ui";
import { getRentRoll } from "@/lib/quickbooks/queries";
import { fmtCents, PartialLabel, SourceBadge } from "../_components/ui";

export const dynamic = "force-dynamic";

export default async function RentRollPage({ searchParams }: PageProps<"/financials/rent-roll">) {
  const sp = await searchParams;
  const basis: QboBasis = sp.basis === "accrual" ? "ACCRUAL" : "CASH";
  const roll = await getRentRoll(basis);

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
      <SourceBadge basis={basis} syncedAt={roll.lastSyncAt} />

      <p className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted">
        Cash rent <strong>received</strong> by month — summed across every class mapped to the
        property (so an entity transfer on refinance shows no gap). No lease data yet, so
        scheduled/market rent, delinquency, and vacancy are out of scope. Section-8 / voucher rent is
        included; owner P2P deposits mis-booked to Rents are excluded and shown separately.
      </p>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <Th>Property</Th>
                {roll.months.map((m) => (
                  <Th key={m} className="text-right">
                    {m.slice(2)}
                  </Th>
                ))}
                <Th className="text-right">Total</Th>
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
                    <Td key={m} className="text-right tabular-nums">
                      {r.byMonth[m] ? fmtCents(r.byMonth[m]) : <span className="text-muted">—</span>}
                    </Td>
                  ))}
                  <Td className="text-right font-medium tabular-nums">{fmtCents(r.totalCents)}</Td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border font-semibold">
                <Td>Portfolio</Td>
                {roll.months.map((m) => (
                  <Td key={m} className="text-right tabular-nums">
                    {fmtCents(roll.portfolioByMonth[m] ?? 0)}
                  </Td>
                ))}
                <Td className="text-right tabular-nums">
                  {fmtCents(
                    Object.values(roll.portfolioByMonth).reduce((a, b) => a + b, 0),
                  )}
                </Td>
              </tr>
            </tfoot>
          </Table>
        </div>
      </Card>
    </div>
  );
}
