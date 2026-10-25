import Link from "next/link";
import { PublicHeader } from "@/components/public/header";
import { PublicFooter } from "@/components/public/footer";
import { publicContainer, publicCtaClass, publicType } from "@/components/public/ui";
import { cn } from "@/lib/utils";

/**
 * Unmatched URLs (no route at all). Uses the public shell since we can't know
 * if the visitor is signed in. The browser bar takes the public material's
 * dark canvas through THEME_SCRIPT, which counts [data-surface="public"] as
 * dark. Its tab title stays the root layout's default: a plain not-found
 * can't export metadata, and a <title> rendered here lands after Next's.
 */
export default function RootNotFound() {
  return (
    <div data-surface="public" className="flex min-h-screen flex-col bg-canvas text-fg-1">
      <PublicHeader />
      <main className={cn(publicContainer, "flex flex-1 flex-col items-center justify-center py-16 text-center")}>
        <h1 className={cn(publicType.heading, "text-fg-1")}>Page not found</h1>
        <p className={cn(publicType.lead, "mt-3 max-w-sm text-fg-3")}>There&rsquo;s nothing at this address.</p>
        <Link href="/" className={cn(publicCtaClass, "mt-8")}>
          Back to the front page
        </Link>
      </main>
      <PublicFooter />
    </div>
  );
}
