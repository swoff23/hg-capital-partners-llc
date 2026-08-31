import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "HG Capital Partners",
  description: "Thoughtfully maintained apartments in Buffalo, New York.",
};

/**
 * Optional backdrop photograph. Drop a file at `public/hero.jpg` and set this to
 * "/hero.jpg" — a dark, wide, low-contrast exterior works best; it renders at
 * 30% opacity behind the copy. Left null, the page is just the gradient.
 */
const HERO_PHOTO: string | null = null;

export default function WelcomePage() {
  return (
    <main className="relative isolate flex flex-1 items-center px-6 sm:px-10">
      {/* Backdrop: near-black, with a single soft pool of light off-centre. */}
      <div className="absolute inset-0 -z-10 bg-[#08090b]">
        {HERO_PHOTO && (
          <Image src={HERO_PHOTO} alt="" fill priority className="object-cover opacity-30" />
        )}
        <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_38%,rgba(150,165,195,0.10),transparent_70%)]" />
      </div>

      <div className="mx-auto flex max-w-lg flex-col items-center py-16 text-center">
        <p className="text-xs font-medium uppercase tracking-[0.32em] text-[#c8a765]">
          Buffalo, New York
        </p>

        <div className="my-7 h-px w-14 bg-[#c8a765]/40" />

        <h1 className="text-[1.375rem] font-normal leading-snug text-[#e8eaee] sm:text-2xl">
          Thoughtfully maintained apartments in some of Buffalo&rsquo;s best
          neighborhoods.
        </h1>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/rentals"
            className="rounded-full bg-[#e8eaee] px-7 py-2.5 text-[0.8125rem] font-medium tracking-wide text-[#08090b] transition-colors duration-200 hover:bg-[#c8a765]"
          >
            View Available Rentals
          </Link>
          <Link
            href="/residents"
            className="rounded-full border border-white/15 px-7 py-2.5 text-[0.8125rem] font-medium tracking-wide text-[#e8eaee] transition-colors duration-200 hover:border-[#c8a765]/60 hover:bg-white/[0.04]"
          >
            I&rsquo;m a Current Resident
          </Link>
        </div>
      </div>
    </main>
  );
}
