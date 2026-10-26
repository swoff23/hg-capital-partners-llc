import { Card, CardBody, CardHeader } from "@/components/ui";
import { FactStrip } from "@/components/fact-strip";
import { MonthBarsSkeleton } from "@/components/month-bars";
import { todayYmdEastern } from "@/lib/dates";
import { trailingMonths } from "@/lib/quickbooks/months";

/* A block standing in for a figure: static --fill-1, no shimmer (brand section 7). */
const block = "block bg-fill-1";

/**
 * The Overview while QuickBooks figures load (charts 4; brand section 7,
 * skeletons): the page holds its shape. The control row and source line
 * keep their height, the strip's labels draw at once over --fill-1 figure
 * blocks, and the month chart and expense card draw their frames. Static,
 * no shimmer. In the Overview's own route group, so the Rent roll and
 * Settings tabs don't borrow its shape. References: Mercury's loading
 * states, Square's flat skeleton.
 */
export default function FinancialsOverviewLoading() {
  const months = trailingMonths(todayYmdEastern().slice(0, 7));
  return (
    <div aria-busy="true" className="space-y-8 pointer-coarse:space-y-6">
      <div className="space-y-4">
        <div className="h-8 pointer-coarse:h-11" />
        <span className={`${block} h-4 w-64 max-w-full`} />
        {/* The real strip over blocks, so the rules, insets and rows are the ones the figures land in. */}
        <FactStrip
          size="l"
          facts={["Income", "Expense", "NOI", "NOI after interest"].map((label) => ({
            label,
            value: <span className={`${block} inline-block h-6 w-28 align-middle`} />,
          }))}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <MonthBarsSkeleton size="overview" months={months} />
        <Card aria-busy="true">
          <CardHeader className="py-2.5">
            <h2 className="text-section text-fg-1">Operating expense</h2>
            <span className={`${block} mt-1 h-4 w-48`} />
          </CardHeader>
          <CardBody>
            <ul aria-hidden="true" className="space-y-3">
              {[0, 1, 2, 3].map((i) => (
                <li key={i} className="space-y-1">
                  <span className={`${block} h-4 w-2/5`} />
                  <span className={`${block} h-1 w-full`} />
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
