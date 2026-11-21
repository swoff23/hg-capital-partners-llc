import type { Metadata } from "next";
import { publicContainer, publicType } from "@/components/public/ui";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { EmailMyLink } from "./email-my-link";

export const metadata: Metadata = {
  title: { absolute: `Request maintenance | ${BRAND.company}` },
  description: "Get the link you use to send HG Capital repair requests.",
};

/**
 * Request maintenance (docs/specs/maintenance-requests.md, section 3.7): each
 * resident has their own link; this page emails it to the address on file.
 */
export default function MaintenancePage() {
  return (
    <main className={cn(publicContainer, "py-10 sm:py-12")}>
      <h1 className={cn(publicType.heading, "max-w-2xl text-foreground")}>Request maintenance</h1>
      <p className={cn(publicType.meta, "mt-2 max-w-xl text-pretty text-muted-foreground")}>
        Repairs go through your own link. We&rsquo;ll email it to the address we have on file.
      </p>
      <EmailMyLink />
      <p className={cn(publicType.meta, "mt-8 text-muted-foreground")}>Emergency? Text us in our group chat.</p>
    </main>
  );
}
