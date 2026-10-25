import { requireUser } from "@/lib/auth";
import { EmptyState, Table, Td, Th, TextLink, buttonClass } from "@/components/ui";
import { qbo } from "@/lib/quickbooks/config";
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
  WarnMark,
} from "../_components/ui";

export const dynamic = "force-dynamic";

const dash = <span className="text-fg-3">—</span>;

export default async function RentRollPage({ searchParams }: PageProps<"/financials/rent-roll">) {
  await requireUser(); // here as well as in the layout, which doesn't gate every render
  const sp = await searchParams;
  // ?basis= is a one-off override; without it the basis chosen in Settings applies
  const roll = await getRentRoll(basisFromParam(sp.basis));

  if (!roll || !roll.connected) {
    // One sentence and one action, as the Overview's empty state has.
    return qbo.isConfigured() ? (
      <EmptyState
        action={
          <a href="/api/quickbooks/connect" className={buttonClass({ variant: "primary" })}>
            Connect QuickBooks
          </a>
        }
      >
        Connect QuickBooks to see the rent roll.
      </EmptyState>
    ) : (
      <EmptyState>QuickBooks isn&apos;t set up yet.</EmptyState>
    );
  }

  const thisYear = Number(todayYmdEastern().slice(0, 4));

  return (
    <div className="space-y-4">
      <SourceLine period={periodOf(roll.months)} basis={roll.basis} syncedAt={roll.lastSyncAt} />

      {roll.sandbox && <SandboxNotice />}

      {/* Summed across every class mapped to the property, so an entity transfer on refinance
          shows no gap. No lease data yet: scheduled and market rent, delinquency and vacancy are
          out of scope. Section-8 and voucher rent is included; owner P2P deposits mis-booked to
          Rents are left out and shown separately (Settings, cleanup list). The Total column says
          what the figures are on the basis on screen: rent received on cash, rent billed on accrual. */}

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
              <Th numeric className="whitespace-nowrap">
                {roll.basis === "CASH" ? "Rent received" : "Rent billed"}
              </Th>
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
                      {/* glyph plus word, as on Settings: warn alone is too close to danger */}
                      {r.ownerFundedCents > 0 && (
                        <WarnMark>
                          <span>
                            Owner-funded <MoneyCents cents={r.ownerFundedCents} /> (excl.)
                          </span>
                        </WarnMark>
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
