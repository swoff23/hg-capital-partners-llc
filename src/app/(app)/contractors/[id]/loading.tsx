import { BackLink } from "@/components/back-link";
import { RailFact, RailList } from "@/components/rail";
import { Block, HeadingBlock, LoadingScreen, rowWidth } from "@/components/skeleton";
import { Section } from "@/components/ui";

/** The Contact section's rows on every contractor (./contact-section.tsx), and the widths their values land in. */
const FACTS = [
  { label: "Company", block: "w-28" },
  { label: "Trades", block: "w-32" },
  { label: "Phone", block: "w-24" },
  { label: "Email", block: "w-36" },
  { label: "Address", block: "w-40" },
  { label: "Billing", block: "w-24" },
  { label: "Availability", block: "w-20" },
  { label: "Tenant fixes", block: "w-8" },
  { label: "W-9", block: "w-16" },
  {
    label: (
      <>
        Insurance<span className="max-sm:hidden"> (COI)</span>
      </>
    ),
    key: "Insurance",
    block: "w-16",
  },
];

/**
 * A contractor while they load (docs/specs/performance.md 4.3), on the page's
 * grid: Contractors, the Contact rows' labels, Notes, Portal access and Jobs
 * draw at once; the name, the company line, the values and the job rows are
 * --fill-1 blocks in the page's own boxes.
 */
export default function ContractorLoading() {
  return (
    <LoadingScreen className="@container max-w-300">
      <BackLink fallback="/contractors" label="Contractors" />
      <div className="mt-2 mb-6">
        <HeadingBlock className="w-64" />
        <div className="mt-1">
          <Block text="text-meta" className="w-32" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 pointer-coarse:gap-6 @4xl:grid-cols-[minmax(0,1fr)_20rem] @4xl:gap-10">
        <aside className="min-w-0 space-y-8 pointer-coarse:space-y-6 @4xl:col-start-2 @4xl:row-start-1">
          <Section title="Contact">
            <RailList>
              {FACTS.map((f) => (
                <RailFact key={f.key ?? String(f.label)} label={f.label}>
                  <Block text="text-body" className={f.block} />
                </RailFact>
              ))}
            </RailList>
          </Section>
          <Section title="Notes">
            <Block text="text-body" className="w-3/4" />
          </Section>
          <Section title="Portal access">
            {/* Most contractors have no login yet: its line and the Create login button's frame. */}
            <div className="space-y-2">
              <Block text="text-meta" className="w-24" />
              <Block className="h-9 w-28 rounded-md pointer-coarse:h-11" />
            </div>
          </Section>
        </aside>

        <Section className="min-w-0 @4xl:col-start-1 @4xl:row-start-1" title="Jobs">
          <ul aria-hidden="true" className="@container divide-y divide-line">
            {Array.from({ length: 6 }, (_, i) => (
              <li
                key={i}
                className="grid grid-cols-[1rem_minmax(0,1fr)] items-start gap-x-3 py-2.5 pointer-coarse:py-3 @min-[30rem]:grid-cols-[7rem_minmax(0,1fr)_6rem] @min-[30rem]:items-center"
              >
                <span className="flex h-5 items-center pointer-coarse:h-5.5">
                  <Block className="size-3.5 rounded-full @min-[30rem]:h-4 @min-[30rem]:w-20" />
                </span>
                <span className="min-w-0">
                  <Block text="text-body" className={rowWidth(i)} />
                  <Block text="text-meta" className="w-28" />
                </span>
                <span className="hidden justify-end @min-[30rem]:flex">
                  <Block text="text-meta" className="w-12" />
                </span>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </LoadingScreen>
  );
}
