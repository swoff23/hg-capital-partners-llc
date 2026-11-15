import { SheetRoute } from "@/components/create-form";
import { DealRecordSheet } from "../../../deals/[id]/deal-record";

/**
 * A deal's sheet over the page it was clicked on (a deals row, search, a
 * property's "From deal"): an intercepted soft navigation to `/deals/[id]`.
 * A reload or a pasted link gets `deals/[id]/page.tsx`, the list with the
 * same sheet open over it.
 */
export default async function DealSheetRoute({ params }: PageProps<"/deals/[id]">) {
  const { id } = await params;
  return (
    <SheetRoute path={`/deals/${id}`}>
      <DealRecordSheet id={id} />
    </SheetRoute>
  );
}

export const dynamic = "force-dynamic";
