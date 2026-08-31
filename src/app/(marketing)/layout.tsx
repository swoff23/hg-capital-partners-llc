import { PublicHeader } from "@/components/public/header";
import { PublicFooter } from "@/components/public/footer";

/**
 * Public-facing pages (landing, rentals, residents, about — and later the
 * tenant portal). Deliberately outside the (app) shell: no sidebar, no auth,
 * and a fixed dark palette that ignores the in-app theme toggle — this is
 * the front door, it should look the same for everyone.
 */
export default function MarketingLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col bg-[#080b12] text-[#f2f4f7]">
      <PublicHeader />
      <div className="flex flex-1 flex-col">{children}</div>
      <PublicFooter />
    </div>
  );
}
