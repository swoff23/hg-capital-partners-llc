"use client";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { RecordMoreMenu } from "@/components/record-archive";
import { Sheet } from "@/components/sheet";
import { setDealArchived } from "../actions";
import { DealAddress } from "./deal-detail";

/**
 * A deal, always in a sheet over the deals list: there is no deal page.
 * A row (or search, or any link in the app) opens it at the deal's own URL
 * over the page it was opened from, through the `@modal` slot's
 * intercepting route; a reload, a pasted link or ⌘-click loads the list
 * with it open (deals/[id]/page.tsx). The header is the deal's own: its
 * address, edited in place, and the ⋯ menu with Copy link and Archive. The
 * facts sit in a 256px column that stays put while Activity scrolls beside
 * it, so the notes and the next action are always in view; on a phone the
 * facts come first and Activity follows. Everything saves as it changes,
 * so there's no Save.
 *
 * Closing goes back, to the list as it was left. Opened by a full load,
 * there's nothing in the app to go back to, so it replaces itself with
 * `closeHref` (the list with its remembered query).
 */
export function DealSheet({
  id,
  address,
  archived,
  closeHref,
  details,
  children,
}: {
  id: string;
  address: string;
  archived: boolean;
  /** Set when the sheet came with a full page load: where closing goes instead of back. */
  closeHref?: string;
  /** The left column: the facts, with the converted and archived lines over them. */
  details: ReactNode;
  /** Activity: the note box and the log. */
  children: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(true);

  return (
    <Sheet
      title={address}
      header={<DealAddress id={id} value={address} />}
      headerAction={<RecordMoreMenu kind="deal" id={id} href={`/deals/${id}`} archived={archived} action={setDealArchived} />}
      size="lg"
      fullHeight
      isOpen={open}
      onOpenChange={(next) => {
        if (next) return;
        setOpen(false);
        if (closeHref) router.replace(closeHref);
        else router.back();
      }}
      // As wide as the size allows, so the two columns don't shift with what's in them.
      className="md:w-full"
    >
      <div className="grid grid-cols-1 gap-6 p-4 md:grid-cols-[16rem_minmax(0,1fr)] md:gap-8 md:p-6">
        {/* Held at the grid's own 24px top, so it doesn't jump when the scroll starts. */}
        <div className="min-w-0 md:sticky md:top-6 md:self-start">{details}</div>
        <div className="min-w-0">{children}</div>
      </div>
    </Sheet>
  );
}
