import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { publicContainer, publicLinkHover } from "./ui";

/** Bottom of every public page: the legal line and a way to reach us, in --pub-faint over a --line rule. */
export function PublicFooter() {
  return (
    <footer className="border-t border-line">
      <div
        className={cn(
          publicContainer,
          "flex flex-col gap-1 py-5 text-meta text-pub-faint sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:py-6",
        )}
      >
        <span>
          &copy; {new Date().getFullYear()} {BRAND.company} LLC
        </span>
        <a
          href="mailto:hgcapitalpartnersllc@gmail.com"
          className={cn("inline-flex w-fit items-center pointer-coarse:min-h-11", publicLinkHover)}
        >
          Contact us
        </a>
      </div>
    </footer>
  );
}
