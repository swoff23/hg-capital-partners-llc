import type { ReactNode } from "react";

/**
 * A phone number or email as a tel: or mailto: link in the surrounding text
 * style, so a tap calls or writes (ADMIN-004). Plain text when there's no
 * usable link (src/lib/contacts.ts telHref, mailtoHref).
 */
export function ContactLink({ href, children }: { href: string | null; children: ReactNode }) {
  if (!href) return <>{children}</>;
  return (
    <a href={href} className="hover:underline">
      {children}
    </a>
  );
}
