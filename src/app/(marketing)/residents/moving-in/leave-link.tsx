"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLeaveGuard } from "@/components/leave-guard";

/**
 * A link out of the move-in page that asks first while a report is half
 * filled in (the page's LeaveGuard): a plain click goes through the guard, and
 * a new-tab click or a middle click opens as links do. The public header's own
 * links aren't guarded here; a reload or a back swipe is safe anyway, since
 * every answer is kept on the device.
 */
export function LeaveLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  const router = useRouter();
  const guard = useLeaveGuard();
  return (
    <Link
      href={href}
      className={className}
      onClick={(e) => {
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        guard(() => router.push(href));
      }}
    >
      {children}
    </Link>
  );
}
