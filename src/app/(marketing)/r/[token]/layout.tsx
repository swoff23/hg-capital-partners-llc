import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LeaveGuard } from "@/components/leave-guard";
import { ToastProvider } from "@/components/toast";
import { UploadQueueProvider } from "@/components/upload-queue";
import { residentScope } from "@/lib/attachments/queue-owner";
import { BRAND } from "@/lib/brand";
import { resolveResidentLink } from "@/lib/residents/links";
import { Ended } from "./_components/ended";

export const metadata: Metadata = {
  title: { absolute: `Repairs | ${BRAND.company}`, template: `%s | ${BRAND.company}` },
  robots: { index: false, follow: false },
  // The link is the key: never hand it to another site in a Referer.
  referrer: "no-referrer",
};

/**
 * A resident's own pages (docs/specs/maintenance-requests.md, section 3), on
 * the public site's shell. The link is who they are: a token we never made is
 * a 404, and one that has ended shows the ended page instead of anything
 * else. Every page and action still resolves the link itself, since a layout
 * doesn't re-run on client navigation. Their uploads go through a queue of
 * their own (`resident:<token>`), which the token route and the record step
 * read back to check the link.
 */
export default async function ResidentLayout({ children, params }: LayoutProps<"/r/[token]">) {
  const { token } = await params;
  const link = await resolveResidentLink(token);
  if (!link) notFound();
  if (link.state === "ended") return <Ended />;
  const scope = residentScope(token);
  return (
    <ToastProvider>
      <LeaveGuard>
        <UploadQueueProvider key={scope} scope={scope}>
          {children}
        </UploadQueueProvider>
      </LeaveGuard>
    </ToastProvider>
  );
}
