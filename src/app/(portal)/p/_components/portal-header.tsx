import type { ReactNode } from "react";
import { Monogram } from "@/components/monogram";
import { TopTabs } from "@/components/nav";
import { Block } from "@/components/skeleton";
import { BRAND } from "@/lib/brand";

const TABS = [
  { href: "", label: "Jobs" },
  { href: "/invoices", label: "Invoices" },
];

/**
 * The bar over My jobs and Your invoices (Connor, Nov 24: option A of
 * docs/specs/contractor-top-nav/01-nav-options.svg, with the tabs on the
 * right): the monogram and the wordmark on the left, then Jobs and Invoices
 * beside the account button, so a contractor sees both are theirs. The tabs
 * are TopTabs in its `bar` form, the underline on the bar's edge. Phones keep
 * the wordmark for screen readers only, as the app's bar does, to make room.
 * A job page draws JobHeader instead (its back arrow), and a crew link only
 * ever opens its one job, so it never meets this bar. `account` is the
 * AccountMenu, or AccountPlaceholder on a loading screen.
 */
export function PortalHeader({ account }: { account: ReactNode }) {
  return (
    <header className="border-b border-border bg-canvas">
      <div className="mx-auto flex h-14 max-w-400 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <span className="flex shrink-0 items-center gap-2 text-label font-semibold text-foreground">
          <Monogram size={32} />
          <span className="max-sm:sr-only">{BRAND.portal}</span>
        </span>
        <div className="flex min-w-0 items-center gap-2 self-stretch">
          <TopTabs bar base="/p" label="Main" tabs={TABS} />
          {account}
        </div>
      </div>
    </header>
  );
}

/** The account button's place while a page loads: a contractor's avatar is a 32px rounded square. */
export function AccountPlaceholder() {
  return (
    <span className="-mr-1.5 flex h-11 w-11 shrink-0 items-center justify-center">
      <Block className="size-8 rounded-sm" />
    </span>
  );
}
