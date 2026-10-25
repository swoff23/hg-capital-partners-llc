import type { Metadata } from "next";
import { ArrowUpRight } from "lucide-react";
import { Money } from "@/components/money";
import { Eyebrow, publicContainer, publicLinkHover, publicType } from "@/components/public/ui";
import { BRAND } from "@/lib/brand";
import { prisma } from "@/lib/db";
import { daysUntil, fmtDay, todayYmdEastern } from "@/lib/dates";
import { shortAddress } from "@/lib/normalize";
import { cn } from "@/lib/utils";
import { PhotoCarousel } from "./photo-carousel";

export const metadata: Metadata = {
  title: { absolute: `Rentals | ${BRAND.company}` },
  description: "Apartments for rent in Buffalo, New York.",
};

export const dynamic = "force-dynamic";

type ListingCardData = {
  id: string;
  unitLabel: string;
  /** The full address: the photos' alt text. */
  address: string;
  /** The card's title: the street alone, so it stays on one line (section 10, Caption). */
  street: string;
  zillowUrl: string | null;
  rent: string | null;
  facts: string;
  photos: string[];
  leased: boolean;
  /** The photo pill: "Leased", or "Available Nov 1" while the move-in date is ahead. */
  status?: string;
};

/** "2 bd", but a word the editor typed ("Studio") stays as it is. */
function count(value: string | null, unit: string): string | null {
  const v = value?.trim();
  if (!v) return null;
  return /^\d+(\.\d+)?$/.test(v) ? `${v} ${unit}` : v;
}

export default async function RentalsPage() {
  const rows = await prisma.listing.findMany({
    where: { status: { in: ["AVAILABLE", "LEASED"] } },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    include: {
      property: { select: { address: true } },
      photos: { orderBy: { sortOrder: "asc" }, select: { url: true } },
    },
  });

  const today = todayYmdEastern();
  const listings: ListingCardData[] = rows.map((l) => {
    const leased = l.status === "LEASED";
    const ahead = (daysUntil(l.availableDate, today) ?? 0) > 0;
    return {
      id: l.id,
      unitLabel: l.unitLabel,
      address: l.property.address,
      street: shortAddress(l.property.address) || l.property.address,
      zillowUrl: l.zillowUrl,
      rent: l.rent?.toString() ?? null,
      facts: [count(l.beds, "bd"), count(l.baths, "ba"), l.sqft && `${l.sqft.toLocaleString("en-US")} sq ft`]
        .filter(Boolean)
        .join(" · "),
      photos: l.photos.map((p) => p.url),
      leased,
      status: leased
        ? "Leased"
        : ahead
          ? `Available ${fmtDay(l.availableDate, { year: "auto", now: today })}`
          : undefined,
    };
  });

  const available = listings.filter((l) => !l.leased).length;

  // Available first, then the ones already leased, in one grid: the photo's
  // Leased pill marks them.
  return (
    <main className={cn(publicContainer, "py-10 sm:py-12")}>
      <Eyebrow>{available > 0 ? `Rentals · ${available} available` : "Rentals · None available"}</Eyebrow>
      <h1 className={cn(publicType.heading, "mt-3 text-fg-1")}>Apartments in Buffalo.</h1>

      {available === 0 && (
        <p className={cn(publicType.lead, "mt-3 max-w-xl text-fg-3")}>
          No openings right now. Check back soon.
        </p>
      )}

      {listings.length > 0 && (
        <div className="mt-8 grid gap-x-6 gap-y-7 sm:grid-cols-2 sm:gap-y-8 lg:grid-cols-3">
          {listings.map((l) => (
            <ListingCard key={l.id} listing={l} />
          ))}
        </div>
      )}
    </main>
  );
}

/**
 * A borderless 4:3 photo card: the photo, then the street with the rent
 * right-aligned ("/mo" in --fg-3), the unit, and the facts line when there
 * are facts (docs/brand-guidelines.md, section 10). The city is the page's
 * heading, so the card leaves it out.
 */
function ListingCard({ listing: l }: { listing: ListingCardData }) {
  return (
    <article className="flex min-w-0 flex-col gap-3">
      <PhotoCarousel photos={l.photos} label={l.address} status={l.status} />

      <div className="grid gap-0.5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className={cn(publicType.title, "min-w-0 text-fg-1")}>{l.street}</h2>
          {!l.leased && (
            <p className={cn(publicType.title, "shrink-0 text-right text-fg-1")}>
              {l.rent ? (
                <>
                  <Money value={l.rent} />
                  <span className="font-normal text-fg-3">/mo</span>
                </>
              ) : (
                <span className="font-normal text-fg-3">Price on request</span>
              )}
            </p>
          )}
        </div>
        <p className={cn(publicType.meta, "text-fg-3")}>{l.unitLabel}</p>
        {/* No facts yet: nothing, since "Price on request" above already says to ask. */}
        {l.facts && <p className={cn(publicType.meta, "num text-fg-3")}>{l.facts}</p>}
        {l.zillowUrl && !l.leased && (
          <a
            href={l.zillowUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              publicType.meta,
              "mt-2 inline-flex w-fit items-center gap-1 text-fg-1 pointer-coarse:min-h-11",
              publicLinkHover,
            )}
          >
            View on Zillow
            <ArrowUpRight aria-hidden="true" className="size-4 stroke-[1.5]" />
          </a>
        )}
      </div>
    </article>
  );
}
