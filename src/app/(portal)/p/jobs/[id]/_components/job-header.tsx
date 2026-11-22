import type { ReactNode } from "react";
import { Phone } from "lucide-react";
import { BackLink } from "@/components/back-link";
import { buttonClass } from "@/components/ui";
import { officeTelHref } from "@/lib/portal/office";
import { NotWhenShared } from "../../../_components/shared-link";
import { cn } from "@/lib/utils";

/**
 * The job page's top bar (Connor, Nov 22; Angi's "Project details" and Vrbo's
 * centered title with Share): the back arrow on the left (to My jobs, named
 * so for screen readers), "Project details" over the job's short address in
 * the middle, truly centered, and on the right Share with crew (`share`,
 * while the job is open) and, once the office number is set, Call HG. The
 * words are sentence case (uppercase is the public site's eyebrow only,
 * brand section 5) and a step under the page's sizes: micro over meta
 * (Connor, Nov 22). The page, its loading screen and its error screen all
 * draw this one, so the way back sits in the same place whether the job has
 * loaded, is loading or failed to load; the last two have no address or
 * Share. Someone the job was shared with gets no back arrow, only the job
 * (Connor, Nov 22): My jobs isn't theirs. Its empty slot keeps the middle
 * centered.
 */
export function JobHeader({ place = null, share = null }: { place?: string | null; share?: ReactNode }) {
  const tel = officeTelHref();
  // Both sides as wide as the wider one (two 44px buttons), so the middle is centered on the screen.
  const side = tel && share ? "5.75rem" : "2.75rem";
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-canvas">
      <div
        className="mx-auto grid h-14 max-w-300 items-center gap-2 px-2 sm:px-4 lg:px-6"
        style={{ gridTemplateColumns: `minmax(${side}, 1fr) minmax(0, max-content) minmax(${side}, 1fr)` }}
      >
        <div className="flex min-w-0 justify-start">
          <NotWhenShared>
            <BackLink fallback="/p" label="My jobs" iconOnly />
          </NotWhenShared>
        </div>
        <div className="min-w-0 text-center">
          <p className="text-micro text-muted-foreground">Project details</p>
          {place && <p className="truncate text-meta font-medium text-foreground">{place}</p>}
        </div>
        <div className="flex items-center justify-end gap-1">
          {share}
          {tel && (
            <a href={tel} aria-label="Call HG Capital" className={cn(buttonClass({ variant: "ghost", icon: true }), "h-11 w-11")}>
              <Phone className="h-5 w-5" aria-hidden="true" />
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
