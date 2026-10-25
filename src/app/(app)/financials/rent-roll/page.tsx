import { requireUser } from "@/lib/auth";
import { EmptyState, Table, Td, Th, TextLink } from "@/components/ui";
import { getRentRoll } from "@/lib/quickbooks/queries";
import { basisFromParam } from "@/lib/quickbooks/rollup";
import { todayYmdEastern } from "@/lib/dates";
import { fmtMonth, periodOf } from "../_components/period";
import {
  flushTable,
  grandTotalRow,
  MoneyCents,
  PartialLabel,
  SandboxNotice,
  SourceLine,
} from "../_components/ui";

export const dynamic = "force-dynamic";

const dash = <span className="text-fg-3">—</span>;

export default async function RentRollPage({ searchParams }: PageProps<"/financials/rent-roll">) {
  await requireUser(); // here as well as in the layout, which doesn't gate every render
  const sp = await searchParams;
  // ?basis= is a one-off override; without it the basis chosen in Settings applies
  const roll = await getRentRoll(basisFromParam(sp.basis));

  if (!roll || !roll.connected) {
    return <EmptyState>Connect QuickBooks to see the rent roll.</EmptyState>;
  }

  const thisYear = Number(todayYmdEastern().slice(0, 4));

  return (
    <div className="space-y-4">
      <SourceLine period={periodOf(roll.months)} basis={roll.basis} syncedAt={roll.lastSyncAt} />

      {roll.sandbox && <SandboxNotice />}

      <p className="max-w-prose text-pretty text-meta text-fg-3">
        {roll.basis === "CASH" ? (
          <>
            Cash rent <strong className="font-medium text-fg-2">received</strong>
          </>
        ) : (
          <>
            Rent <strong className="font-medium text-fg-2">earned</strong>
          </>
        )}{" "}
        by month, summed across every class mapped to the property so an entity transfer on
        refinance shows no gap. No lease data yet, so scheduled/market rent, delinquency, and
        vacancy are out of scope. Section-8 / voucher rent is included; owner P2P deposits
        mis-booked to Rents are excluded and shown separately.
      </p>

      {roll.rows.length === 0 ? (
        // never a $0 Portfolio total over zero rows
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
      ) : (
        <Table className={flushTable}>
          <thead>
            <tr>
              <Th>Property</Th>
              {roll.months.map((m) => (
                <Th key={m} numeric>
                  {fmtMonth(m, thisYear)}
                </Th>
              ))}
              <Th numeric>Total</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {roll.rows.map((r) => (
              <tr key={r.propertyId} className="hover:bg-fill-1">
                <Td className="min-w-48">
                  <TextLink href={`/properties/${r.propertyId}`}>{r.address}</TextLink>
                  <PartialLabel months={r.monthsOfData} className="ml-2" />
                  {(r.subsidyCents > 0 || r.ownerFundedCents > 0) && (
                    <div className="text-meta text-fg-3">
                      {r.subsidyCents > 0 && (
                        <>
                          Voucher <MoneyCents cents={r.subsidyCents} />
                        </>
                      )}
                      {r.subsidyCents > 0 && r.ownerFundedCents > 0 && " · "}
                      {r.ownerFundedCents > 0 && (
                        <span className="text-warn">
                          Owner-funded <MoneyCents cents={r.ownerFundedCents} /> (excl.)
                        </span>
                      )}
                    </div>
                  )}
                </Td>
                {roll.months.map((m) => (
                  <Td key={m} numeric>
                    {r.byMonth[m] ? <MoneyCents cents={r.byMonth[m]} /> : dash}
                  </Td>
                ))}
                <Td numeric>
                  <MoneyCents cents={r.totalCents} />
                </Td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className={grandTotalRow}>
              <Td>Portfolio</Td>
              {roll.months.map((m) => (
                <Td key={m} numeric>
                  {/* a month whose rent isn't matched to any property is the dash, never $0 */}
                  {roll.portfolioByMonth[m] != null ? <MoneyCents cents={roll.portfolioByMonth[m]} /> : dash}
                </Td>
              ))}
              <Td numeric>
                <MoneyCents cents={Object.values(roll.portfolioByMonth).reduce((a, b) => a + b, 0)} />
              </Td>
            </tr>
          </tfoot>
        </Table>
      )}
    </div>
  );
}
