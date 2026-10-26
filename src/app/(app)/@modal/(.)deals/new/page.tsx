import { SheetRoute } from "@/components/create-form";
import { NewDealScreen } from "../../../deals/new/new-deal-screen";

/** New deal as a sheet over the page the link was clicked on: an intercepted soft navigation to `/deals/new`. A pasted link or a reload gets `deals/new/page.tsx`. */
export default function NewDealSheet({ searchParams }: PageProps<"/deals/new">) {
  return (
    <SheetRoute path="/deals/new">
      <NewDealScreen variant="sheet" searchParams={searchParams} />
    </SheetRoute>
  );
}
