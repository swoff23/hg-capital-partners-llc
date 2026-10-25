import Link from "next/link";
import type { Metadata } from "next";
import { ArrowUpRight } from "lucide-react";
import { publicContainer, publicType } from "@/components/public/ui";
import { Badge, Card } from "@/components/ui";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: { absolute: `Residents | ${BRAND.company}` },
  description: "Maintenance, rent, and move-in resources for HG Capital residents.",
};

/**
 * Fill these in once you have the real destinations. A tile becomes a link
 * the moment its href is non-null; left null, it shows "Soon" instead of a
 * dead link.
 */
const BASELANE_URL: string | null = "https://tenant.baselane.com/login";

export default function ResidentsPage() {
  return (
    <main className={cn(publicContainer, "py-10 sm:py-12")}>
      <h1 className={cn(publicType.heading, "max-w-2xl text-fg-1")}>
        Everything you need as an HG Capital resident.
      </h1>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <Tile title="Moving in" body="Move-in checklist and the condition form." href="/residents/moving-in" />
        <Tile title="Pay rent" body="Handled securely through Baselane." href={BASELANE_URL} />
        <Tile title="Request maintenance" body="Send photos of the issue straight to our team." />
      </div>
    </main>
  );
}

/** A public fact tile: the flat Card, its name turning gold on hover when it's a link. */
function Tile({ title, body, href }: { title: string; body: string; href?: string | null }) {
  // Internal pages (href starting with "/") stay in the same tab and skip the
  // external-link arrow: that icon specifically signals "leaves this site."
  const external = !!href && !href.startsWith("/");

  const card = (
    <Card className="h-full p-4 transition-colors group-hover:border-line-strong">
      <div className="flex items-start justify-between gap-2">
        <h2 className={cn(publicType.title, "text-fg-1", href && "transition-colors group-hover:text-gold")}>{title}</h2>
        {!href ? (
          <Badge className="mt-0.5 shrink-0">Soon</Badge>
        ) : (
          external && <ArrowUpRight aria-hidden="true" className="mt-1 size-4 shrink-0 stroke-[1.5] text-fg-3" />
        )}
      </div>
      <p className={cn(publicType.meta, "mt-1 text-pretty text-fg-3")}>{body}</p>
    </Card>
  );

  if (!href) return card;
  return (
    <Link
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="group block rounded-lg"
    >
      {card}
    </Link>
  );
}
