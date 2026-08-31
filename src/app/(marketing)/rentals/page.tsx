import type { Metadata } from "next";
import { prisma } from "@/lib/db";

export const metadata: Metadata = {
  title: "Rentals — HG Capital Partners",
  description: "Available apartments in Buffalo, New York.",
};

export const dynamic = "force-dynamic";

type ListingCardData = {
  id: string;
  unitLabel: string;
  address: string;
  zillowUrl: string | null;
  rent: string | null;
  beds: string | null;
  baths: string | null;
  sqft: number | null;
  photoUrl: string | null;
  leased: boolean;
};

export default async function RentalsPage() {
  const rows = await prisma.listing.findMany({
    where: { status: { in: ["AVAILABLE", "LEASED"] } },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    include: { property: { select: { address: true } } },
  });

  const listings: ListingCardData[] = rows.map((l) => ({
    id: l.id,
    unitLabel: l.unitLabel,
    address: l.property.address,
    zillowUrl: l.zillowUrl,
    rent: l.rent?.toString() ?? null,
    beds: l.beds,
    baths: l.baths,
    sqft: l.sqft,
    photoUrl: l.photoUrl,
    leased: l.status === "LEASED",
  }));

  const available = listings.filter((l) => !l.leased);
  const leased = listings.filter((l) => l.leased);

  return (
    <main className="flex flex-1 flex-col items-center px-6 py-16 sm:px-10">
      <div className="w-full max-w-5xl">
        <div className="text-center">
          <p className="text-xs font-medium uppercase tracking-[0.32em] text-[#c8a765]">Rentals</p>
          <div className="my-7 h-px w-14 bg-[#c8a765]/40 mx-auto" />
          <h1 className="text-[1.375rem] font-normal leading-snug text-[#e8eaee] sm:text-2xl">
            Available apartments in Buffalo.
          </h1>
        </div>

        {available.length > 0 ? (
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {available.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        ) : (
          <p className="mx-auto mt-12 max-w-sm text-center text-sm leading-relaxed text-[#767d8a]">
            Nothing available right now — check back soon, or see our current listings on Zillow.
          </p>
        )}

        {leased.length > 0 && (
          <div className="mt-16">
            <p className="text-center text-xs font-medium uppercase tracking-[0.32em] text-[#c8a765]">
              Previously Leased
            </p>
            <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {leased.map((l) => (
                <ListingCard key={l.id} listing={l} />
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function ListingCard({ listing: l }: { listing: ListingCardData }) {
  const details = [
    l.beds && `${l.beds} bd`,
    l.baths && `${l.baths} ba`,
    l.sqft && `${l.sqft} sqft`,
  ].filter(Boolean);

  const card = (
    <div
      className={
        "group overflow-hidden rounded-2xl border transition-colors duration-200 " +
        (l.leased
          ? "border-white/[0.08] opacity-70"
          : "border-white/15 hover:border-[#c8a765]/60 hover:bg-white/[0.03]")
      }
    >
      <div className="relative aspect-[4/3] bg-white/[0.03]">
        {l.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- external Blob URL, fine unoptimized
          <img src={l.photoUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-[#4c525c]">
            No photo yet
          </div>
        )}
        {l.leased && (
          <span className="absolute left-3 top-3 rounded-full border border-white/15 bg-[#08090b]/80 px-2.5 py-1 text-[0.625rem] font-medium uppercase tracking-wider text-[#e8eaee]">
            Leased
          </span>
        )}
      </div>

      <div className="p-5">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium text-[#e8eaee]">{l.unitLabel}</h2>
          {l.rent && !l.leased && (
            <span className="shrink-0 text-sm font-medium text-[#e8eaee]">
              ${Number(l.rent).toLocaleString()}
              <span className="text-[#767d8a]">/mo</span>
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-[#767d8a]">{l.address}</p>
        {details.length > 0 && (
          <p className="mt-2 text-xs text-[#767d8a]">{details.join(" · ")}</p>
        )}
        {l.zillowUrl && !l.leased && (
          <div className="mt-4 flex items-center gap-1.5 text-xs font-medium text-[#c8a765]">
            View on Zillow
            <svg
              viewBox="0 0 24 24"
              className="h-3 w-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M7 17 17 7M7 7h10v10" />
            </svg>
          </div>
        )}
      </div>
    </div>
  );

  return l.zillowUrl && !l.leased ? (
    <a href={l.zillowUrl} target="_blank" rel="noopener noreferrer" className="block">
      {card}
    </a>
  ) : (
    card
  );
}
