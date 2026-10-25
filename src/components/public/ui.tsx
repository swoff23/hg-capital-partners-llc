import type * as React from "react";
import { buttonClass, textLinkClass } from "@/components/ui";
import { cn } from "@/lib/utils";
import publicType from "./type.module.css";

/* The public site's pieces (docs/brand-guidelines.md, sections 4 and 10). The
   public site is the app's dark theme, fixed: every page sits inside a
   [data-surface="public"] wrapper, so the app's tokens and primitives (Input,
   Select, Card, Badge, SegmentedControl) already render in the dark material
   there. What follows is only what the public site does differently. */

/** The public type roles: display, heading, lead, eyebrow, wordmark, title, meta. */
export { publicType };

/**
 * The page column for the header, every page and the footer, so the wordmark,
 * each page's first line and the footer share an edge. Gutters 16 / 32 / 40
 * (phone, tablet, laptop), and the column stops at 1280 on wider screens.
 */
export const publicContainer = "mx-auto w-full max-w-320 px-4 sm:px-8 lg:px-10";

/**
 * The public CTA: limestone (--act) with an ink label, rounded-md, 40px (48 on
 * touch), and gold on hover. It's the app's primary Button with the public
 * height and hover, so focus and disabled behave the same. One per view.
 */
export const publicCtaClass = cn(
  buttonClass({ variant: "primary" }),
  "h-10 px-4.5 pointer-coarse:min-h-12 not-disabled:hover:bg-gold not-disabled:active:bg-gold",
);

/** The second action beside a CTA: the app's secondary Button at the CTA's height. */
export const publicSecondaryClass = cn(buttonClass({ variant: "secondary" }), "h-10 px-4.5 pointer-coarse:min-h-12");

/** A link's hover and press on the public site: gold, then the brighter gold while pressed. */
export const publicLinkHover = "transition-colors hover:text-gold active:text-pub-gold-hi";

/** A link inside a sentence: TextLink's underlined ink, turning gold on hover. For an <a> or a Next Link. */
export const publicTextLinkClass = cn(textLinkClass, publicLinkHover);

/**
 * The page's one eyebrow, in gold, carrying a real fact ("Rentals · 2
 * available"). Uppercase lives only here and in the wordmark. `as="h1"` when
 * it is the page's only heading (the sign-in page).
 */
export function Eyebrow({
  as: Tag = "p",
  className,
  ...props
}: React.HTMLAttributes<HTMLElement> & { as?: "p" | "h1" }) {
  return <Tag className={cn(publicType.eyebrow, "text-gold", className)} {...props} />;
}
