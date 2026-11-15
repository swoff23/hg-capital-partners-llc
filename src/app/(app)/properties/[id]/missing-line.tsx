"use client";
import { useEffect, useState } from "react";
import { CircleAlert } from "lucide-react";
import { Notice } from "@/components/source-line";
import { textLinkClass } from "@/components/ui";
import type { Gap, SkippedGap } from "@/lib/missing/checks";
import type { HandedOff } from "@/lib/missing/queries";
import { cn } from "@/lib/utils";
import { MissingList } from "../../missing/missing-list";
import { openPropertyField } from "./edit-field-event";

/**
 * A property's Missing info line (docs/specs/missing-info.md, D2): under the
 * header, "14 missing" and Show, which opens this property's required rows
 * right in the line, each opening its field on this page. Gone once nothing
 * required is missing. The marks in each section are missing-context.tsx.
 */
export function PropertyMissingLine({ gaps, handed, className }: { gaps: Gap[]; handed: Record<string, HandedOff>; className?: string }) {
  const [open, setOpen] = useState(false);
  if (gaps.length === 0) return null;
  return (
    <Notice
      className={className}
      icon={<CircleAlert aria-hidden="true" strokeWidth={2} className="size-3.5 shrink-0 text-warn pointer-coarse:size-4" />}
      action={
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className={cn(textLinkClass, "relative mr-1.5 rounded-sm text-meta pointer-coarse:after:absolute pointer-coarse:after:-inset-3")}
        >
          {open ? "Hide" : "Show"}
        </button>
      }
      below={open ? <MissingList gaps={gaps} skipped={[] as SkippedGap[]} handed={handed} variant="property" /> : undefined}
    >
      {gaps.length} missing
    </Notice>
  );
}

/**
 * A Missing info row on the worklist links to `?fill=<field>`: once the page
 * is in, that field's editor opens (its section listens), and the address
 * drops the request so a reload doesn't open it again.
 */
export function FillOnArrival() {
  useEffect(() => {
    const url = new URL(window.location.href);
    const field = url.searchParams.get("fill");
    if (!field) return;
    url.searchParams.delete("fill");
    window.history.replaceState(window.history.state, "", url);
    // After the sections below have subscribed.
    const frame = requestAnimationFrame(() => openPropertyField(field));
    return () => cancelAnimationFrame(frame);
  }, []);
  return null;
}
