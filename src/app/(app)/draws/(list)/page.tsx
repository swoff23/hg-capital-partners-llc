import { requireUser } from "@/lib/auth";
import { todayYmdEastern } from "@/lib/dates";
import { currentDraw, lineFigures, portfolioDraws, rehabFigures } from "@/lib/draws/figures";
import { doneCount, listRehabs, rehabPropertyOptions } from "@/lib/draws/queries";
import { FactStrip } from "@/components/fact-strip";
import { Meter } from "@/components/meter";
import { Money } from "@/components/money";
import { EmptyState, PageHeader, RowCell, Table, Th, pendingRowFill } from "@/components/ui";
import { cn, fmtMoney } from "@/lib/utils";
import { CurrentDraw } from "../current-draw";
import { NewRehabButton } from "../new-rehab";
import { ViewSwitch } from "../view-switch";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Draws" };

/**
 * Draws (docs/specs/rehab-draws.md, L1): the totals across every open rehab
 * (ready to draw, submitted, funded, left), then one row per rehab, built
 * like Portfolio. The whole row opens the rehab. From lg a Funded meter ends
 * the row; below sm each row is two lines (the name, then the current draw)
 * with the meter under them, and the amounts live on the rehab's page.
 */
export default async function DrawsPage({ searchParams }: PageProps<"/draws">) {
  await requireUser();
  const view = (await searchParams).view === "done" ? "done" : "open";
  const today = todayYmdEastern();
  const [open, shown, done, options] = await Promise.all([
    listRehabs("open"),
    view === "done" ? listRehabs("done") : null,
    doneCount(),
    rehabPropertyOptions(),
  ]);

  const rows = (shown ?? open).map((r) => {
    const fig = rehabFigures(r.holdback, lineFigures(r.lines, r.draws), r.draws);
    return { rehab: r, fig, current: currentDraw(r.draws) };
  });
  const totals = portfolioDraws(open.map((r) => rehabFigures(r.holdback, lineFigures(r.lines, r.draws), r.draws)));
  const propertyOptions = options.map((o) => ({ id: o.id, address: o.address }));

  return (
    <>
      <PageHeader title="Draws" actions={<NewRehabButton options={propertyOptions} />} />
      <div className="mb-4">
        <ViewSwitch view={view} open={open.length} done={done} />
      </div>

      {view === "open" && open.length > 0 && (
        <FactStrip
          facts={[
            { label: "Ready to draw", value: <Money value={totals.ready} /> },
            { label: "Submitted", value: <Money value={totals.atLender} /> },
            { label: "Funded", value: <Money value={totals.funded} /> },
            { label: "Left", value: <Money value={totals.left} /> },
          ]}
        />
      )}

      {rows.length === 0 ? (
        <EmptyState action={view === "open" ? <NewRehabButton options={propertyOptions} /> : undefined}>
          {view === "open" ? "No open rehabs. Add one to track its draws." : "No rehabs are done yet."}
        </EmptyState>
      ) : (
        <Table className="mt-4">
          <thead>
            <tr>
              <Th className="pl-0">Rehab</Th>
              <Th className="max-sm:hidden">Current draw</Th>
              <Th numeric className="max-sm:hidden">
                Ready
              </Th>
              <Th numeric className="max-sm:hidden">
                Left
              </Th>
              <Th numeric className="max-lg:hidden">
                Funded
              </Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map(({ rehab, fig, current }) => {
              const href = `/draws/${rehab.id}`;
              return (
                <tr key={rehab.id} className={cn("transition-colors duration-fast hover:bg-muted", pendingRowFill)}>
                  <RowCell href={href} first cell="w-full max-w-0 sm:w-auto sm:max-w-none" className="pl-0 max-sm:py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body text-foreground">{rehab.name}</span>
                      <span className="block truncate text-meta text-muted-foreground sm:hidden">
                        <CurrentDraw draw={current} today={today} />
                      </span>
                      <Meter
                        className="mt-1.5 sm:hidden"
                        value={fig.funded}
                        max={fig.holdback}
                        label={`${rehab.name} funded`}
                        valueText={fundedWords(fig.funded, fig.holdback)}
                      />
                    </span>
                  </RowCell>
                  <RowCell href={href} cell="max-sm:hidden" className="whitespace-nowrap text-body">
                    <CurrentDraw draw={current} today={today} />
                  </RowCell>
                  <RowCell href={href} numeric cell="max-sm:hidden">
                    <Money value={fig.ready} />
                  </RowCell>
                  <RowCell href={href} numeric cell="max-sm:hidden">
                    <Money value={fig.left} />
                  </RowCell>
                  <RowCell href={href} numeric cell="max-lg:hidden">
                    <span className="flex w-36 flex-col items-end gap-1.5">
                      <Money value={fig.funded} />
                      <Meter value={fig.funded} max={fig.holdback} label={`${rehab.name} funded`} valueText={fundedWords(fig.funded, fig.holdback)} />
                    </span>
                  </RowCell>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </>
  );
}

/** "$142,500 funded of $160,000", for the meter's screen reader text. */
function fundedWords(funded: number, holdback: number): string {
  return `${fmtMoney(funded)} funded of ${fmtMoney(holdback)}`;
}

export const dynamic = "force-dynamic";
