import type { ReactNode } from "react";
import { BackLink } from "@/components/back-link";
import { FactStrip } from "@/components/fact-strip";
import { Money } from "@/components/money";
import { Section } from "@/components/ui";
import type { RehabFigures } from "@/lib/draws/figures";
import { fmtCents } from "../format";
import type { PropertyOption } from "../new-rehab";
import { MoreMenu } from "./more-menu";

/**
 * A rehab's layout (docs/specs/rehab-draws.md, L2): the lease page's grid. The Budget in the main column, and a
 * 320px rail from lg with Details, then Draws (Connor, Nov 20: Draws "into right column"). The rail scrolls with
 * the page, since a long list of draws would run past a sticky one; below lg it stacks under the Budget. Back and, once it's marked
 * done, "Done" and the day sit on the first row with the ⋯, the name on its own line below, then the figures. The
 * phone's figures are Ready and Left.
 */
export function RehabView({
  rehabId,
  name,
  done,
  fig,
  edit,
  children,
  details,
  draws,
}: {
  rehabId: string;
  name: string;
  /** "Done Nov 14", or null while it's open. */
  done: string | null;
  fig: RehabFigures;
  /** What Edit rehab starts from, and the properties it can pick. */
  edit: { lender: string; propertyIds: string[]; options: PropertyOption[] };
  children: ReactNode;
  details: ReactNode;
  /** The Draws section, under Details in the rail. */
  draws: ReactNode;
}) {
  // Whole dollars: a gap of cents isn't worth a line.
  const gap = fig.holdbackGap != null && Math.round(fig.holdbackGap) !== 0 ? fig.holdbackGap : null;
  return (
    <div
      className={
        "grid max-w-300 gap-x-10 [grid-template-areas:'head'_'strip'_'main'_'fields'] " +
        "lg:grid-cols-[minmax(0,1fr)_20rem] lg:[grid-template-areas:'head_fields'_'strip_fields'_'main_fields']"
      }
    >
      <header className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 [grid-area:head] [grid-template-areas:'nav_more'_'title_title']">
        <div className="flex min-w-0 items-center gap-1.5 [grid-area:nav]">
          <BackLink fallback="/draws" label="Draws" />
          {done && (
            <>
              <span aria-hidden="true" className="text-meta text-muted-foreground">
                /
              </span>
              <span className="whitespace-nowrap text-meta text-muted-foreground">{done}</span>
            </>
          )}
        </div>
        <div className="[grid-area:more]">
          <MoreMenu rehabId={rehabId} name={name} done={done !== null} edit={edit} />
        </div>
        <h1 className="min-w-0 py-1 text-title font-semibold text-foreground [grid-area:title] [overflow-wrap:anywhere]">{name}</h1>
      </header>

      <div className="min-w-0 pt-2 [grid-area:strip]">
        <FactStrip
          className="max-sm:hidden"
          facts={[
            { label: "Holdback", value: <Money value={fig.holdback} /> },
            { label: "Funded", value: <Money value={fig.funded} /> },
            { label: "Submitted", value: <Money value={fig.atLender} /> },
            { label: "Ready", value: <Money value={fig.ready} /> },
            { label: "Left", value: <Money value={fig.left} /> },
          ]}
        />
        <FactStrip
          className="sm:hidden"
          facts={[
            { label: "Ready", value: <Money value={fig.ready} /> },
            { label: "Left", value: <Money value={fig.left} /> },
          ]}
        />
        {gap != null && (
          <p className="mt-2 truncate text-meta text-muted-foreground">
            Budget is {fmtCents(Math.abs(gap))} {gap > 0 ? "over" : "under"} the holdback.
          </p>
        )}
      </div>

      <aside aria-label="Rehab details" className="min-w-0 space-y-8 pt-6 [grid-area:fields] pointer-coarse:space-y-6 lg:self-start lg:pt-2">
        <Section title="Details">{details}</Section>
        {draws}
      </aside>

      <div className="min-w-0 space-y-8 pt-6 [grid-area:main] pointer-coarse:space-y-6 lg:pt-6">{children}</div>
    </div>
  );
}
