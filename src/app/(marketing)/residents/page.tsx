import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Residents — HG Capital Partners",
  description: "Maintenance, rent, and move-in resources for HG Capital residents.",
};

/**
 * Fill these in once you have the real destinations — each tile below
 * activates automatically the moment its const is non-null. Left null, the
 * tile shows as "Opening soon" instead of a dead link.
 */
const BASELANE_URL: string | null = "https://www.baselane.com/login";

export default function ResidentsPage() {
  return (
    <main className="flex flex-1 flex-col items-center px-6 py-16 sm:px-10">
      <div className="w-full max-w-3xl text-center">
        <p className="text-xs font-medium uppercase tracking-[0.32em] text-[#c8a765]">Residents</p>
        <div className="my-7 h-px w-14 bg-[#c8a765]/40 mx-auto" />
        <h1 className="text-[1.375rem] font-normal leading-snug text-[#e8eaee] sm:text-2xl">
          Everything you need as an HG Capital resident.
        </h1>

        <div className="mt-12 grid gap-4 sm:grid-cols-3">
          <Tile
            title="Moving In"
            body="Move-in checklist and the condition form."
            href="/residents/moving-in"
          />
          <Tile title="Pay Rent" body="Handled securely through Baselane." href={BASELANE_URL} />
          <Tile
            title="Request Maintenance"
            body="Report an issue with photos — it goes straight to our team."
          />
        </div>
      </div>
    </main>
  );
}

function Tile({ title, body, href }: { title: string; body: string; href?: string | null }) {
  // Internal pages (href starting with "/") stay in the same tab and skip the
  // external-link arrow — that icon specifically signals "leaves this site."
  const external = !!href && !href.startsWith("/");

  const inner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-[#e8eaee]">{title}</h2>
        {href ? (
          external && (
            <svg
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5 shrink-0 text-[#767d8a] transition-colors group-hover:text-[#c8a765]"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M7 17 17 7M7 7h10v10" />
            </svg>
          )
        ) : (
          <span className="rounded-full border border-white/10 px-2 py-0.5 text-[0.625rem] uppercase tracking-wider text-[#5b6576]">
            Soon
          </span>
        )}
      </div>
      <p className="mt-2 text-sm leading-relaxed text-[#767d8a]">{body}</p>
    </>
  );

  const className =
    "group block rounded-2xl border p-6 text-left transition-colors duration-200 " +
    (href
      ? "border-white/15 hover:border-[#c8a765]/60 hover:bg-white/[0.03]"
      : "border-white/[0.07] opacity-60");

  if (!href) return <div className={className}>{inner}</div>;
  return external ? (
    <Link href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {inner}
    </Link>
  ) : (
    <Link href={href} className={className}>
      {inner}
    </Link>
  );
}
