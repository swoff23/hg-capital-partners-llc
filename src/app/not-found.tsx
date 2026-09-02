import Link from "next/link";
import { PublicHeader } from "@/components/public/header";
import { PublicFooter } from "@/components/public/footer";

/** Unmatched URLs (no route at all). Uses the public shell since we can't know if the visitor is signed in. */
export default function RootNotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-[#080b12] text-[#f2f4f7]">
      <PublicHeader />
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <p className="text-xs font-medium uppercase tracking-[0.32em] text-[#c8a765]">Page not found</p>
        <div className="my-7 h-px w-14 bg-[#c8a765]/40" />
        <p className="max-w-sm text-sm leading-relaxed text-[#767d8a]">
          There&rsquo;s nothing at this address.
        </p>
        <Link
          href="/"
          className="mt-8 rounded-full border border-white/15 px-7 py-2.5 text-[0.8125rem] font-medium tracking-wide text-[#e8eaee] transition-colors duration-200 hover:border-[#c8a765]/60 hover:bg-white/[0.04]"
        >
          Back to the front page
        </Link>
      </main>
      <PublicFooter />
    </div>
  );
}
