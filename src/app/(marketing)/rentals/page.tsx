import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Rentals — HG Capital Partners",
  description: "Available apartments in Buffalo, New York.",
};

/**
 * Placeholder for Phase 3 (see the V1 plan): a real Listing model, one card
 * per available unit, each linking to its Zillow post. Until then this is an
 * honest holding page rather than a dead link off the homepage CTA.
 */
export default function RentalsPage() {
  return (
    <main className="flex flex-1 flex-col items-center px-6 py-16 text-center sm:px-10">
      <p className="text-xs font-medium uppercase tracking-[0.32em] text-[#c8a765]">Rentals</p>
      <div className="my-7 h-px w-14 bg-[#c8a765]/40" />
      <h1 className="max-w-md text-[1.375rem] font-normal leading-snug text-[#e8eaee] sm:text-2xl">
        Our current listings are posted on Zillow — the full list is landing
        here shortly.
      </h1>
      <p className="mt-5 max-w-sm text-sm leading-relaxed text-[#767d8a]">
        Already a resident with a question?{" "}
        <Link href="/residents" className="text-[#c8a765] hover:underline">
          Visit the Residents page
        </Link>
        .
      </p>
    </main>
  );
}
