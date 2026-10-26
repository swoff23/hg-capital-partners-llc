"use client";
import type { ComponentProps } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLeaveGuard } from "@/components/leave-guard";

/**
 * A link that asks first while the page holds unsaved work (the nearest
 * LeaveGuard): a plain click goes through the guard, and a new-tab click or a
 * middle click opens as links do. The sidebar, TopTabs, the header's home
 * link and the public move-in page's way out are these. Outside a guard, or
 * with nothing held, it is a plain link.
 */
export function LeaveLink({ href, onClick, ...rest }: Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
  const router = useRouter();
  const guard = useLeaveGuard();
  return (
    <Link
      href={href}
      {...rest}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        // A link to another window or a download leaves nothing behind.
        if ((rest.target && rest.target !== "_self") || rest.download !== undefined) return;
        e.preventDefault();
        guard(() => router.push(href));
      }}
    />
  );
}
