import type { Metadata } from "next";
import type { ListingStatus } from "@prisma/client";
import { ArrowUpRight } from "lucide-react";
import { Money } from "@/components/money";
import { Eyebrow, publicContainer, publicLinkHover, publicType } from "@/components/public/ui";
import { BRAND } from "@/lib/brand";
import { prisma } from "@/lib/db";
import { toYmd, todayYmdEastern } from "@/lib/dates";
import { shortAddress } from "@/lib/normalize";
import { listingPill } from "@/lib/properties/listing-pill";
import { cn } from "@/lib/utils";
import { NotifyMe } from "./notify-me";
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
  status: ListingStatus;
  /** The photo pill (lib/properties/listing-pill.ts): "Leased", "Available Nov 1", "Coming in January", "Coming soon". */
  pill?: string;
};

/** "2 bd", but a word the editor typed ("Studio") stays as it is. */
function count(value: string | null, unit: string): string | null {
  const v = value?.trim();
  if (!v) return null;
  return /^\d+(\.\d+)?$/.test(v) ? `${v} ${unit}` : v;
}

export default async function RentalsPage() {
  const rows = await prisma.listing.findMany({
    // Never a listing at an archived property (lib/archive.ts).
    where: { status: { in: ["AVAILABLE", "COMING_SOON", "LEASED"] }, property: { archivedAt: null } },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    include: {
      property: { select: { address: true } },
      photos: { orderBy: { sortOrder: "asc" }, select: { url: true } },
    },
  });

  const today = todayYmdEastern();
  // Coming-soon homes go soonest first, undated last. The status order (Available, Coming soon, Leased)
  // and today's newest-edit order inside the other two stay as the query gave them.
  const soonest = (a: (typeof rows)[number], b: (typeof rows)[number]) => {
    const [x, y] = [toYmd(a.availableDate), toYmd(b.availableDate)];
    return x === y ? 0 : x === null ? 1 : y === null ? -1 : x < y ? -1 : 1;
  };
  const ordered = [
    ...rows.filter((l) => l.status === "AVAILABLE"),
    ...rows.filter((l) => l.status === "COMING_SOON").sort(soonest),
    ...rows.filter((l) => l.status === "LEASED"),
  ];
  const listings: ListingCardData[] = ordered.map((l) => ({
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
    status: l.status,
    pill: listingPill(l.status, l.availableDate, today),
  }));

  const available = listings.filter((l) => l.status === "AVAILABLE").length;
  const coming = listings.filter((l) => l.status === "COMING_SOON").length;
  const availableFact = `${available} available`;
  const comingFact = `${coming} coming soon`;
  // Below 640 the line keeps one fact, so it stays on one line at 320.
  const full = available > 0 && coming > 0 ? `${availableFact} · ${comingFact}` : available > 0 ? availableFact : coming > 0 ? comingFact : "None available";
  const short = available > 0 ? availableFact : coming > 0 ? comingFact : "None available";

  // Available first, then the coming-soon homes, then the ones already leased, in one grid: the photo's pill marks them.
  return (
    <main className={cn(publicContainer, "py-10 sm:py-12")}>
      <Eyebrow>
        {/* Two spans, so only one is ever shown or read out. */}
        <span className="max-sm:hidden">Rentals · {full}</span>
        <span className="sm:hidden">Rentals · {short}</span>
      </Eyebrow>
      <h1 className={cn(publicType.heading, "mt-3 text-foreground")}>Apartments in Buffalo.</h1>

      {available === 0 && coming === 0 && (
        // No link until there's a Zillow profile URL (docs/todo-for-connor.md).
        <p className={cn(publicType.lead, "mt-3 max-w-xl text-muted-foreground")}>
          No openings right now. Check back soon. Our homes are also listed on Zillow.
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
 * right-aligned ("/mo" in --muted-foreground), the unit, and the facts line when there
 * are facts (docs/brand-guidelines.md, section 10). The city is the page's
 * heading, so the card leaves it out.
 */
function ListingCard({ listing: l }: { listing: ListingCardData }) {
  const coming = l.status === "COMING_SOON";
  const zillow = !!l.zillowUrl && l.status !== "LEASED";
  // The full-screen viewer's header: the street, and the rent while it's open ("56 Tamarack St · $1,450/mo").
  const viewerTitle = (
    <>
      {l.street}
      {l.status !== "LEASED" && l.rent && (
        <>
          {" · "}
          <Money value={l.rent} />
          /mo
        </>
      )}
    </>
  );
  return (
    <article className="flex min-w-0 flex-col gap-3">
      <PhotoCarousel photos={l.photos} label={l.address} status={l.pill} viewerTitle={viewerTitle} />

      <div className="grid gap-0.5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className={cn(publicType.title, "min-w-0 text-foreground")}>{l.street}</h2>
          {/* The rent when it's entered; "Price on request" for Available only, nothing on a coming-soon card without one. */}
          {l.status !== "LEASED" && (l.rent || l.status === "AVAILABLE") && (
            <p className={cn(publicType.title, "shrink-0 text-right text-foreground")}>
              {l.rent ? (
                <>
                  <Money value={l.rent} />
                  <span className="font-normal text-muted-foreground">/mo</span>
                </>
              ) : (
                <span className="font-normal text-muted-foreground">Price on request</span>
              )}
            </p>
          )}
        </div>
        <p className={cn(publicType.meta, "text-muted-foreground")}>{l.unitLabel}</p>
        {/* No facts yet: nothing, since "Price on request" above already says to ask. */}
        {l.facts && <p className={cn(publicType.meta, "num text-muted-foreground")}>{l.facts}</p>}
        {(coming || zillow) && (
          // One row that fits at 320: Notify me (coming soon only), then View on Zillow.
          <div className="mt-2 flex items-center gap-4">
            {coming && (
              <NotifyMe
                listingId={l.id}
                title={[l.street, l.unitLabel].filter(Boolean).join(", ")}
                pill={l.pill ?? "Coming soon"}
                photoUrl={l.photos[0] ?? null}
              />
            )}
            {zillow && (
              <a
                href={l.zillowUrl!}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  publicType.meta,
                  "inline-flex w-fit items-center gap-1 text-foreground pointer-coarse:min-h-11",
                  publicLinkHover,
                )}
              >
                View on Zillow
                <ArrowUpRight aria-hidden="true" className="size-4 stroke-[1.5]" />
              </a>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
