import { Info, Plus } from "lucide-react";
import { Block, LoadingScreen } from "@/components/skeleton";
import { Section } from "@/components/ui";
import { cn } from "@/lib/utils";

/** The editor's rule row grid (../capex-rules-editor.tsx): the name, three figures and the remove slot. */
const rowGrid = cn(
  "grid items-center gap-x-2 gap-y-1.5 max-sm:grid-cols-[minmax(0,1fr)_2.75rem]",
  "sm:grid-cols-[minmax(10rem,1fr)_6.5rem_6.5rem_7.5rem_1.5rem] sm:pointer-coarse:grid-cols-[minmax(10rem,1fr)_6.5rem_6.5rem_7.5rem_2.75rem]",
);

/** A field's frame at the editor's small size: 32px with a mouse, 44 on touch. */
const field = "h-8 rounded-md pointer-coarse:h-11";

/** A figure's column header. */
const th = "whitespace-nowrap px-2.5 text-right text-meta font-medium text-fg-3";

/**
 * CapEx rules while they load (docs/specs/performance.md 4.3): the action
 * row keeps its height; Appliances and Building systems, their column
 * headers, Per unit and the add rows draw at once, and each rule is its
 * fields' frames on the editor's own row grid.
 */
export default function CapexRulesLoading() {
  return (
    <LoadingScreen className="space-y-8 pointer-coarse:space-y-6">
      <div className="h-8 pointer-coarse:h-11" />
      <Section title="Appliances">
        <Header first="Appliance" />
        <Rules count={5} />
        <AddFrame>Add appliance</AddFrame>
      </Section>
      <Section title="Building systems">
        <Header first="System" />
        <p className="pb-1 pt-3 text-meta font-medium text-fg-2">Per unit</p>
        <Rules count={5} />
        <AddFrame>Add system</AddFrame>
      </Section>
    </LoadingScreen>
  );
}

/** RuleHeader's two forms: the name and the three figures from sm, the figures alone below it. Its ⓘ as an icon. */
function Header({ first }: { first: string }) {
  const tip = <Info aria-hidden="true" className="size-4 text-fg-3" strokeWidth={1.5} />;
  return (
    <>
      <div className={cn(rowGrid, "mb-1 hidden border-b border-line-strong pb-2 sm:grid")}>
        <span className="text-meta font-medium text-fg-3">{first}</span>
        <span className={cn(th, "flex items-center justify-end gap-1")}>Monitor at {tip}</span>
        <span className={cn(th, "flex items-center justify-end gap-1")}>Replace at {tip}</span>
        <span className={th}>Cost</span>
        <span />
      </div>
      <div className="mb-1 grid grid-cols-3 gap-2 border-b border-line-strong pb-2 sm:hidden">
        <span className={th}>Monitor at</span>
        <span className={th}>Replace at</span>
        <span className={th}>Cost</span>
      </div>
    </>
  );
}

function Rules({ count }: { count: number }) {
  return (
    <div aria-hidden="true" className="divide-y divide-line">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={cn(rowGrid, "py-1.5 pointer-coarse:py-1")}>
          <Block className={field} />
          <span className="max-sm:col-span-full max-sm:grid max-sm:grid-cols-3 max-sm:gap-2 sm:contents">
            <Block className={field} />
            <Block className={field} />
            <Block className={field} />
          </span>
        </div>
      ))}
    </div>
  );
}

/** AddRow's box and words, inert. */
function AddFrame({ children }: { children: string }) {
  return (
    <div className="flex min-h-10 w-full items-center gap-2 border-t border-line py-2 text-label text-fg-2 pointer-coarse:min-h-12">
      <Plus aria-hidden="true" strokeWidth={1.75} className="h-4 w-4 shrink-0 text-fg-3" />
      {children}
    </div>
  );
}
