"use client";
import { useSearchParams } from "next/navigation";
import { Block } from "@/components/skeleton";
import { PageHeader } from "@/components/ui";

/**
 * The Playbooks title as the loading screen draws it. Opened from a property
 * (`?property=`), the page shows a back link to it and "Apply one to …", so
 * both hold their places as blocks.
 */
export function PlaybooksHeaderFrame() {
  const fromProperty = useSearchParams().has("property");
  return (
    <>
      {fromProperty && (
        // BackLink's inline box, its words a block.
        <div className="mb-1">
          <span className="inline-flex w-28 items-center text-meta pointer-coarse:min-h-11">
            <Block text="text-meta" className="w-full" />
          </span>
        </div>
      )}
      <PageHeader title="Playbooks" subtitle={fromProperty ? <Block text="text-body" className="w-48" /> : undefined} />
    </>
  );
}
