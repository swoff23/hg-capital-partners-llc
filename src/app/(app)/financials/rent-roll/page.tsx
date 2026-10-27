import { requireUser } from "@/lib/auth";
import { buttonClass, EmptyState, flushTable, grandTotalRow, Td, TextLink, Th } from "@/components/ui";
import { SandboxNotice, SourceLine, WarnMark } from "@/components/source-line";
import { qbo } from "@/lib/quickbooks/config";
import { getRentRoll } from "@/lib/quickbooks/queries";
import { addMonths } from "@/lib/quickbooks/months";
import { fmtMonth, fmtMonthYear, periodLabel } from "@/lib/quickbooks/period";
import { basisFromParam } from "@/lib/quickbooks/rollup";
import { cn } from "@/lib/utils";
import { BasisControl } from "../_components/period-row";
import { MoneyCents } from "../_components/ui";
import { GridFrame } from "./grid-frame";
import { RentRollByMonth } from "./month-stepper";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Rent roll" };

export const dynamic = "force-dynamic";

const dash = <span className="text-fg-3">—</span>;

/* The pinned property column: sticky on --surface, with a --line rule on its right edge while the grid is scrolled. */
const pinned =
  "sticky left-0 z-20 bg-surface group-data-scrolled/grid:shadow-[inset_-1px_0_0_var(--line)]";

/**
 * The rent roll (docs/specs/charts.md 2.7): rent by property for the 12
 * months ending with the running month, a statement grid with the property
 * column pinned (Mercury's cash flow table). A month before a property was
 * bought, or before QuickBooks history starts, is blank; one after with no
 * matched rent is the dash, so a missed month reads apart from not owned
 * yet. Rent on no property's class has its
 * own row, so the Portfolio row matches the Overview's rent. Below sm it's
 * one month at a time under a stepper.
 */
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

  const thisYear = Number(roll.runningMonth.slice(0, 4));
  // The window opens at the first month QuickBooks has, not a month before history starts.
  const firstSynced = roll.months.find((m) => m >= roll.historyStart) ?? roll.months[0];
  const window = periodLabel(firstSynced, roll.runningMonth, { through: roll.through }) ?? "";
  // A month before history is blank: the dash is for a month QuickBooks covers and no rent matched.
  const beforeHistory = (m: string) => m < roll.historyStart;
  const totalLabel = roll.basis === "CASH" ? "Rent received" : "Rent billed";
  // The stepper walks the window from history start, and opens on the last complete month.
  const stepMonths = roll.months.filter((m) => m >= roll.historyStart);
  const lastComplete = stepMonths.indexOf(addMonths(roll.runningMonth, -1));
  const startIndex = lastComplete >= 0 ? lastComplete : stepMonths.length - 1;

  return (
    <div className="space-y-4">
      <BasisControl basis={roll.basis} />
      {/* The control above shows the basis, so the line leaves it out. */}
      <SourceLine period={window} basis={roll.basis} showBasis={false} syncedAt={roll.lastSyncAt} />

      {roll.sandbox && <SandboxNotice />}

      {roll.rows.length === 0 ? (
        // never a $0 Portfolio total over zero rows
        <EmptyState>
          {roll.unassigned ? (
            <>
              No rent is matched to a property yet.{" "}
              <TextLink href="/financials/settings#class-mapping">Map QuickBooks classes</TextLink>
            </>
          ) : roll.hasRent ? (
            <>No rent in QuickBooks for {window}.</>
          ) : (
            <>
              No rent in the synced QuickBooks data.{" "}
              <TextLink href="/financials/settings#account-categories">Check account categories</TextLink>
            </>
          )}
        </EmptyState>
      ) : (
        <>
          <div className="sm:hidden">
            <RentRollByMonth
              months={stepMonths}
              startIndex={startIndex}
              basis={roll.basis}
              rows={roll.rows.map((r) => ({
                propertyId: r.propertyId,
                address: r.address,
                purchaseMonth: r.purchaseMonth,
                byMonth: r.byMonth,
              }))}
              unassigned={roll.unassigned?.byMonth ?? null}
              portfolioByMonth={roll.portfolioByMonth}
            />
          </div>

          <div className="max-sm:hidden">
            <GridFrame>
              <table className={cn("w-full text-body", flushTable)}>
                <thead>
                  <tr>
                    <Th className={cn(pinned, "z-30 min-w-56")}>Property</Th>
                    {roll.months.map((m) => (
                      <Th key={m} numeric>
                        {m === roll.runningMonth ? `${fmtMonth(m, thisYear)} MTD` : fmtMonth(m, thisYear)}
                      </Th>
                    ))}
                    <Th numeric>{totalLabel}</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {roll.rows.map((r) => {
                    // "Bought Aug 2026" when the purchase falls in the window, so its blank months read as not owned yet.
                    const bought = r.purchaseMonth && r.purchaseMonth > roll.months[0] ? r.purchaseMonth : null;
                    return (
                      <tr key={r.propertyId} className="group/row hover:bg-fill-1">
                        <Td className={cn(pinned, "min-w-56 group-hover/row:bg-fill-1")}>
                          <TextLink href={`/properties/${r.propertyId}`}>{r.address}</TextLink>
                          {(bought || r.subsidyCents > 0 || r.ownerFundedCents > 0) && (
                            <div className="text-meta text-fg-3">
                              {[
                                bought && <span key="bought">Bought {fmtMonthYear(bought)}</span>,
                                r.subsidyCents > 0 && (
                                  <span key="voucher">
                                    Voucher <MoneyCents cents={r.subsidyCents} />
                                  </span>
                                ),
                                // glyph plus word, as on Settings: warn alone is too close to danger
                                r.ownerFundedCents > 0 && (
                                  <WarnMark key="owner">
                                    <span>
                                      Owner-funded <MoneyCents cents={r.ownerFundedCents} /> (excl.)
                                    </span>
                                  </WarnMark>
                                ),
                              ]
                                .filter(Boolean)
                                .map((part, i) => (
                                  <span key={i}>
                                    {i > 0 && " · "}
                                    {part}
                                  </span>
                                ))}
                            </div>
                          )}
                        </Td>
                        {roll.months.map((m) => (
                          <Td key={m} numeric>
                            {r.byMonth[m] ? (
                              <MoneyCents cents={r.byMonth[m]} />
                            ) : (r.purchaseMonth && m < r.purchaseMonth) || beforeHistory(m) ? null : (
                              dash
                            )}
                          </Td>
                        ))}
                        <Td numeric>
                          <MoneyCents cents={r.totalCents} />
                        </Td>
                      </tr>
                    );
                  })}
                  {roll.unassigned && (
                    <tr>
                      <Td className={cn(pinned, "min-w-56 text-fg-2")}>
                        Rent not tied to a property{" "}
                        <TextLink href="/financials/settings#class-mapping" className="whitespace-nowrap">
                          Map classes
                        </TextLink>
                      </Td>
                      {roll.months.map((m) => (
                        <Td key={m} numeric className="text-fg-2">
                          {roll.unassigned!.byMonth[m] ? (
                            <MoneyCents cents={roll.unassigned!.byMonth[m]} />
                          ) : beforeHistory(m) ? null : (
                            dash
                          )}
                        </Td>
                      ))}
                      <Td numeric className="text-fg-2">
                        <MoneyCents cents={roll.unassigned.totalCents} />
                      </Td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className={grandTotalRow}>
                    <Td className={pinned}>Portfolio</Td>
                    {roll.months.map((m) => (
                      <Td key={m} numeric>
                        {/* a month with no rent at all is the dash, never $0; one before history is blank */}
                        {roll.portfolioByMonth[m] != null ? (
                          <MoneyCents cents={roll.portfolioByMonth[m]} />
                        ) : beforeHistory(m) ? null : (
                          dash
                        )}
                      </Td>
                    ))}
                    <Td numeric>
                      <MoneyCents cents={roll.portfolioTotalCents} />
                    </Td>
                  </tr>
                </tfoot>
              </table>
            </GridFrame>
          </div>
        </>
      )}
    </div>
  );
}
