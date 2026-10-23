import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A phone number, email or mailing address as a tel:, sms:, mailto: or maps
 * link in the surrounding text style, so a tap calls, texts, writes or opens
 * Maps (ADMIN-004). Plain text when there's no usable link
 * (src/lib/contacts.ts telHref, textHref, mailtoHref, mapsHref). `newTab`
 * for a web link (maps), so the record stays open behind it.
 */
export function ContactLink({
  href,
  newTab,
  className,
  children,
  ...rest
}: Omit<ComponentProps<"a">, "href"> & { href: string | null; newTab?: boolean; children: ReactNode }) {
  if (!href) return <>{children}</>;
  return (
    <a
      href={href}
      className={cn("hover:underline", className)}
      {...(newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      {...rest}
    >
      {children}
    </a>
  );
}
