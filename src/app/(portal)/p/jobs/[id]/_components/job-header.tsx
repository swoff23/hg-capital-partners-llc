import type { ReactNode } from "react";
import { Phone } from "lucide-react";
import { BackLink } from "@/components/back-link";
import { buttonClass } from "@/components/ui";
import { officeTelHref } from "@/lib/portal/office";
import { cn } from "@/lib/utils";

/**
 * The job page's top bar: "My jobs" at the top left and, once the office number is set, a Call HG button. The page,
 * its loading screen and its error screen all draw this one, so the way back sits in the same place whether the job
 * has loaded, is loading or failed to load. `actions` sits before Call HG: the loaded page's Text to my crew, while
 * the job is open (the loading and error screens have none). `wide` runs the bar to 1600 for a list page (Your
 * invoices), where the job page's record column is 1200.
 */
export function JobHeader({ actions, wide = false }: { actions?: ReactNode; wide?: boolean }) {
  const tel = officeTelHref();
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-canvas">
      <div className={cn("mx-auto flex h-14 items-center justify-between gap-3 px-2 sm:px-4 lg:px-6", wide ? "max-w-400" : "max-w-300")}>
        <BackLink fallback="/p" label="My jobs" className="h-11 rounded-md px-2 text-label text-fg-2" />
        <div className="flex items-center gap-1">
          {actions}
          {tel && (
            <a href={tel} aria-label="Call HG" className={cn(buttonClass({ variant: "ghost", icon: true }), "h-11 w-11")}>
              <Phone className="h-5 w-5" aria-hidden="true" />
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
