import Link from "next/link";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui";
import { fmtMoney } from "@/lib/utils";
import { portfolioCapexForecast, type PortfolioCapexProperty } from "@/lib/property-types";

export function PortfolioCapexForecastCard({
  properties,
}: {
  properties: PortfolioCapexProperty[];
}) {
  const f = portfolioCapexForecast(properties, { years: 5 });
  const maxYear = Math.max(1, ...f.perYear);
  const rows = f.rows.filter((r) => r.total > 0);
  const lastYear = f.years[f.years.length - 1];

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="flex items-center justify-between">
        <CardTitle>Portfolio CapEx forecast</CardTitle>
        <span className="text-xs text-muted">
          {f.fromYear}–{lastYear}
        </span>
      </CardHeader>
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-2xl font-semibold tabular-nums">{fmtMoney(f.total)}</span>
          {f.dueNowTotal > 0 && (
            <span className="text-xs font-medium text-red-600 dark:text-red-400">
              {fmtMoney(f.dueNowTotal)} due soon
            </span>
          )}
        </div>

        {/* Portfolio-wide spend per year */}
        <div className="space-y-1">
          {f.years.map((year, i) => (
            <div key={year} className="flex items-center gap-3 text-xs">
              <span className="w-10 shrink-0 tabular-nums text-muted">{year}</span>
              <span className="h-4 flex-1 overflow-hidden rounded bg-background">
                <span
                  className={
                    "block h-full rounded " +
                    (i === 0 ? "bg-red-500/70 dark:bg-red-500/60" : "bg-primary/50")
                  }
                  style={{ width: `${(f.perYear[i] / maxYear) * 100}%` }}
                />
              </span>
              <span className="w-20 shrink-0 text-right font-medium tabular-nums">
                {f.perYear[i] ? fmtMoney(f.perYear[i]) : "—"}
              </span>
            </div>
          ))}
        </div>

        {/* Property × year matrix */}
        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-xs">
              <thead>
                <tr className="text-left text-muted [&>th]:pb-1 [&>th]:pr-3 [&>th]:font-medium">
                  <th>Property</th>
                  {f.years.map((y) => (
                    <th key={y} className="text-right">
                      {y}
                    </th>
                  ))}
                  <th className="text-right">5-yr</th>
                </tr>
              </thead>
              <tbody className="[&>tr>td]:py-0.5 [&>tr>td]:pr-3">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="max-w-[220px] truncate">
                      <Link href={`/properties/${r.id}`} className="hover:underline">
                        {shortAddr(r.address)}
                      </Link>
                    </td>
                    {r.perYear.map((v, i) => (
                      <td
                        key={i}
                        className={
                          "text-right tabular-nums " +
                          (v === 0 ? "text-muted" : i === 0 ? "text-red-600 dark:text-red-400" : "")
                        }
                      >
                        {v ? fmtMoney(v) : "—"}
                      </td>
                    ))}
                    <td className="!pr-0 text-right font-medium tabular-nums">{fmtMoney(r.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border font-semibold [&>td]:pt-1 [&>td]:pr-3">
                  <td>Total</td>
                  {f.perYear.map((v, i) => (
                    <td key={i} className="text-right tabular-nums">
                      {v ? fmtMoney(v) : "—"}
                    </td>
                  ))}
                  <td className="!pr-0 text-right tabular-nums">{fmtMoney(f.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {rows.length === 0 && (
          <p className="text-sm text-muted">
            No projected CapEx in the next 5 years. Add install years to unit equipment and building
            systems to build the forecast.
          </p>
        )}
      </CardBody>
    </Card>
  );
}

function shortAddr(a: string) {
  return a.split(",")[0].replace(/\s+(buffalo|ny).*/i, "").trim();
}
