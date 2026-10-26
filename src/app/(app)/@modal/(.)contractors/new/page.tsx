import { SheetRoute } from "@/components/create-form";
import { NewContractorScreen } from "../../../contractors/new/new-contractor-screen";

/** New contractor as a sheet over the page the link was clicked on: an intercepted soft navigation to `/contractors/new`. A pasted link or a reload gets `contractors/new/page.tsx`. */
export default function NewContractorSheet() {
  return (
    <SheetRoute path="/contractors/new">
      <NewContractorScreen variant="sheet" />
    </SheetRoute>
  );
}
