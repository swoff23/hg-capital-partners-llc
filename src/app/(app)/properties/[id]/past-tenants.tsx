"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui";

/**
 * The past leases behind a ghost button; once opened it stays open for the
 * visit. One line each from sm; on a phone the names, then the details under
 * them, as the unit rows above read there, so the dates and rent aren't cut.
 */
export function PastTenants({ items }: { items: { leaseId: string; line: string; names: string; detail: string }[] }) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  return (
    <div className="mt-2">
      <Button variant="ghost" size="sm" aria-expanded={open} aria-controls="past-tenants" onClick={() => setOpen((o) => !o)} className="-ml-2.5">
        Past tenants ({items.length})
        <ChevronDown aria-hidden="true" strokeWidth={1.75} className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </Button>
      {open && (
        <ul id="past-tenants" className="mt-1 divide-y divide-border">
          {items.map((p) => (
            <li key={p.leaseId}>
              <Link
                href={`/tenants/${p.leaseId}`}
                className="flex min-h-10 items-center py-2 text-body text-fg-2 underline-offset-3 hover:text-foreground hover:underline pointer-coarse:min-h-12"
              >
                <span className="hidden truncate sm:block">{p.line}</span>
                <span className="flex min-w-0 flex-col sm:hidden">
                  <span className="truncate">{p.names}</span>
                  {p.detail && <span className="truncate text-meta text-muted-foreground">{p.detail}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
