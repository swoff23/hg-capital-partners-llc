import type { ReactNode } from "react";
import { Block, LoadingScreen, rowWidth } from "@/components/skeleton";
import { Section } from "@/components/ui";

/** The Connection section's rows on a connected company, as the page lists them, and their values' widths. */
const CONNECTION = [
  { label: "Status", value: "w-20" },
  { label: "Company", value: "w-40" },
  { label: "Environment", value: "w-20" },
  // The Cash | Accrual switch's frame.
  { label: "Basis", value: "h-8 w-32 rounded-md pointer-coarse:h-11", control: true },
  { label: "Last synced", value: "w-32" },
  { label: "Reconnect by", value: "w-24" },
  { label: "History from", value: "w-20" },
];

/** The cleanup list's rows, those with a note under the value marked. */
const CLEANUP = [false, true, true, false, false, true, true, true, false];

/**
 * Financials Settings while it loads (docs/specs/performance.md 4.3), as a
 * connected company shows it: the section headings and the Connection rows'
 * labels draw at once, on the page's own row boxes; Refresh, the values, the
 * Basis switch and Disconnect are --fill-1 frames, and the cleanup list and
 * the mapping rows are blocks.
 */
export default function FinancialsSettingsLoading() {
  return (
    <LoadingScreen className="max-w-300 space-y-8 pointer-coarse:space-y-6">
      <Section title="Connection" actions={<Block className="h-8 w-20 rounded-md sm:w-48 pointer-coarse:h-11" />}>
        <dl>
          {CONNECTION.map((r) => (
            <Row key={r.label} label={r.label}>
              {r.control ? <Block className={r.value} /> : <Block text="text-body" className={r.value} />}
            </Row>
          ))}
        </dl>
        <div className="pt-3">
          <Block className="h-8 w-24 rounded-md pointer-coarse:h-11" />
        </div>
      </Section>
      <Section title="QuickBooks cleanup list">
        <div aria-hidden="true">
          {/* The source line. */}
          <div className="mb-1">
            <Block text="text-meta" className="w-64 max-w-full" />
          </div>
          {CLEANUP.map((note, i) => (
            // DqRow's box: the label, then the value and its note.
            <div key={i} className="grid gap-x-3 gap-y-0.5 border-b border-line py-2 last:border-b-0 sm:grid-cols-[16rem_minmax(0,1fr)]">
              <Block text="text-meta" className={rowWidth(i, ["w-32", "w-40", "w-28", "w-44"])} />
              <div className="min-w-0">
                <Block text="text-body" className="w-20" />
                {note && <Block text="text-meta" className={rowWidth(i, ["w-48", "w-64", "w-40"])} />}
              </div>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Class mapping">
        <Lines count={5} />
      </Section>
      <Section title="Account categories">
        <Lines count={5} />
      </Section>
    </LoadingScreen>
  );
}

/** The page's label and value row: 40px with a mouse, 48 on touch, over a hairline. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-h-10 grid-cols-[6rem_minmax(0,1fr)] items-center gap-3 border-b border-line py-1.5 last:border-b-0 sm:grid-cols-[7rem_minmax(0,1fr)] pointer-coarse:min-h-12">
      <dt className="text-meta text-fg-3">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

/** A mapping table's rows as blocks: a name and its pick. */
function Lines({ count }: { count: number }) {
  return (
    <ul aria-hidden="true" className="divide-y divide-line">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="flex min-h-12 items-center justify-between gap-3 pointer-coarse:min-h-14">
          <Block text="text-body" className={rowWidth(i, ["w-40", "w-32", "w-48", "w-28"])} />
          <Block className="h-8 w-40 shrink-0 rounded-md pointer-coarse:h-11" />
        </li>
      ))}
    </ul>
  );
}
