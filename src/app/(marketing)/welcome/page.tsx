import Link from "next/link";
import type { Metadata } from "next";
import { Eyebrow, publicContainer, publicCtaClass, publicSecondaryClass, publicType } from "@/components/public/ui";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: { absolute: BRAND.company },
  description: "Thoughtfully maintained apartments in Buffalo, New York.",
};

/**
 * The front page. Until a real HG exterior photo exists the hero is flat
 * --canvas with type: never stock, never a gradient (docs/brand-guidelines.md,
 * section 10). When the photo comes, it runs full bleed above this type
 * (21:9 on a laptop, 16:9 at 768, 4:3 on a phone) with the headline set on
 * its lower left over the bottom scrim, and below it on a phone.
 */
export default function WelcomePage() {
  return (
    <main className={cn(publicContainer, "flex flex-1 flex-col justify-center py-16 sm:py-24")}>
      <div className="max-w-4xl">
        <Eyebrow>Buffalo, New York</Eyebrow>
        {/* The gold hairline: once on the site, under this eyebrow. */}
        <div aria-hidden="true" className="mt-5 h-px w-14 bg-gold" />

        <h1 className={cn(publicType.display, "mt-7 text-fg-1")}>
          Thoughtfully maintained apartments{" "}
          <span className="text-fg-3">in some of Buffalo&rsquo;s best neighborhoods.</span>
        </h1>

        {/* Stacked full width on a phone, side by side from 640. */}
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Link href="/rentals" className={publicCtaClass}>
            View available rentals
          </Link>
          <Link href="/residents" className={publicSecondaryClass}>
            I&rsquo;m a current resident
          </Link>
        </div>
      </div>
    </main>
  );
}
