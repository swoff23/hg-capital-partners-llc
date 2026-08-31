import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "HG Capital Partners",
  description: "Creating value in Buffalo, NY.",
};

/**
 * Optional backdrop photograph. Drop a file at `public/hero.jpg` and set this to
 * "/hero.jpg" — a dark, wide, low-contrast exterior works best; it renders at
 * 30% opacity behind the wordmark. Left null, the page is just the gradient.
 */
const HERO_PHOTO: string | null = null;

/**
 * Optional bison mark above the wordmark. Export the logo on a transparent
 * background (a white or light-gold version reads best on this near-black
 * page), save it as `public/logo.png`, and set this to "/logo.png".
 */
const LOGO: string | null = null;

export default function WelcomePage() {
  return (
    <main className="relative isolate grid min-h-screen place-items-center px-6">
      {/* Backdrop: near-black, with a single soft pool of light off-centre. */}
      <div className="absolute inset-0 -z-10 bg-[#08090b]">
        {HERO_PHOTO && (
          <Image src={HERO_PHOTO} alt="" fill priority className="object-cover opacity-30" />
        )}
        <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_38%,rgba(150,165,195,0.10),transparent_70%)]" />
      </div>

      <div className="flex flex-col items-center text-center">
        {LOGO && (
          <Image src={LOGO} alt="" width={64} height={64} priority className="mb-7 h-16 w-auto opacity-90" />
        )}

        <h1 className="text-[0.8125rem] font-medium uppercase leading-none tracking-[0.36em] text-[#e8eaee] sm:text-sm">
          HG Capital Partners
        </h1>

        <div className="my-8 h-px w-14 bg-[#c8a765]/40" />

        <p className="text-[0.8125rem] leading-relaxed text-[#767d8a]">
          Creating value in Buffalo, NY
        </p>

        <Link
          href="/login"
          className="mt-12 rounded-full border border-white/15 px-8 py-2.5 text-[0.8125rem] font-medium tracking-wide text-[#e8eaee] transition-colors duration-200 hover:border-[#c8a765]/60 hover:bg-white/[0.04]"
        >
          Sign in
        </Link>
      </div>

      {/* A tenant portal and a rentals list go here when they exist — same
          understated treatment, alongside the copyright. */}
      <footer className="absolute inset-x-0 bottom-0 p-6 text-center text-[0.6875rem] tracking-wide text-[#454b55]">
        &copy; {new Date().getFullYear()} HG Capital Partners LLC
      </footer>
    </main>
  );
}
