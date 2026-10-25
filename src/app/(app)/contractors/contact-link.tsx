import type { ComponentProps, ReactNode } from "react";
import { textLinkClass } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * A phone number, email or mailing address as a tel:, sms:, mailto: or maps
 * link, so a tap calls, texts, writes or opens Maps (ADMIN-004). Plain text
 * when there's no usable link (src/lib/contacts.ts telHref, textHref,
 * mailtoHref, mapsHref). It sits in a cell or a field value it could pass
 * for, so it carries the TextLink underline (docs/brand-guidelines.md,
 * section 4: a link is body ink). `newTab` for a web link (maps), so the
 * record stays open behind it.
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
      className={cn(textLinkClass, className)}
      {...(newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      {...rest}
    >
      {children}
    </a>
  );
}
