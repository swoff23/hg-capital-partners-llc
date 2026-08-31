import Link from "next/link";

/**
 * Top nav for every public page (PRD §3: "Primary navigation: Rentals |
 * Residents | About | HG Login"). Deliberately plain text, not a pill or
 * button — HG Login stays the quietest link on the page; it's a door for two
 * people, not a call to action.
 */
const LINKS = [
  { href: "/rentals", label: "Rentals" },
  { href: "/residents", label: "Residents" },
  { href: "/about", label: "About" },
];

export function PublicHeader() {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 px-6 py-6 sm:px-10 sm:py-8">
      <Link
        href="/"
        className="text-[0.8125rem] font-medium uppercase tracking-[0.28em] text-[#e8eaee] transition-colors hover:text-[#c8a765]"
      >
        HG Capital Partners
      </Link>

      <nav className="flex flex-wrap items-center gap-x-7 gap-y-2 text-[0.8125rem]">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="tracking-wide text-[#767d8a] transition-colors hover:text-[#e8eaee]"
          >
            {l.label}
          </Link>
        ))}
        <Link
          href="/login"
          className="tracking-wide text-[#4c525c] transition-colors hover:text-[#c8a765]"
        >
          HG Login
        </Link>
      </nav>
    </header>
  );
}
