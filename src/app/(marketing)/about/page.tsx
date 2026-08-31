import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About — HG Capital Partners",
  description: "Homes we'd want to live in ourselves.",
};

export default function AboutPage() {
  return (
    <main className="flex flex-1 flex-col items-center px-6 py-16 sm:px-10">
      <div className="max-w-md text-center">
        <p className="text-xs font-medium uppercase tracking-[0.32em] text-[#c8a765]">About</p>
        <div className="my-7 mx-auto h-px w-14 bg-[#c8a765]/40" />
        <h1 className="text-[1.375rem] font-normal leading-snug text-[#e8eaee] sm:text-2xl">
          Homes we&rsquo;d want to live in ourselves.
        </h1>
        <p className="mt-6 text-sm leading-relaxed text-[#767d8a]">
          HG Capital Partners owns and manages apartments across Buffalo. We
          keep our buildings well maintained, respond quickly when something
          needs attention, and try to make renting from us straightforward.
        </p>
      </div>
    </main>
  );
}
