/**
 * Public-facing pages (landing, and later the tenant portal + rentals list).
 *
 * Deliberately outside the (app) shell: no sidebar, no auth, and a fixed dark
 * palette that ignores the in-app theme toggle — this is the front door, it
 * should look the same for everyone.
 */
export default function MarketingLayout({ children }: LayoutProps<"/">) {
  return <div className="bg-[#080b12] text-[#f2f4f7]">{children}</div>;
}
