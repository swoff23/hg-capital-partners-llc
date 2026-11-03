"use client";
import { textLinkClass } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * The way forward after a whole-blob save lost to a newer one (forms 2.12):
 * "Load the latest" after the refusal, as `SaveError`'s `action` (or
 * FormSheet's `errorAction`). The caller starts its editor over on what the
 * page now holds: the unit and building system sheets reset their draft and
 * pin the page's version. The settings editors (CapEx rules, the move-in
 * form) still draw the same button inline; fold them into this one when next
 * in that code. 44px to a finger.
 */
export function LoadLatest({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(textLinkClass, "relative rounded-sm pointer-coarse:after:absolute pointer-coarse:after:-inset-3")}
    >
      Load the latest
    </button>
  );
}
