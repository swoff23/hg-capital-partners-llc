"use client";
import { useEffect } from "react";

/** Error boundary for the public pages — same understated dark treatment as the rest of the front door. */
export default function MarketingError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-xs font-medium uppercase tracking-[0.32em] text-[#c8a765]">Something went wrong</p>
      <div className="my-7 h-px w-14 bg-[#c8a765]/40" />
      <p className="max-w-sm text-sm leading-relaxed text-[#767d8a]">
        That page didn&rsquo;t load. Please try again in a moment.
      </p>
      <button
        type="button"
        onClick={() => retry()}
        className="mt-8 rounded-full bg-[#e8eaee] px-7 py-2.5 text-[0.8125rem] font-medium tracking-wide text-[#08090b] transition-colors duration-200 hover:bg-[#c8a765]"
      >
        Try again
      </button>
    </main>
  );
}
