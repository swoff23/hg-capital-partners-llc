import { SheetRoute } from "@/components/create-form";
import { NewPropertyScreen } from "../../../properties/new/new-property-screen";

/** New property as a sheet over the page the link was clicked on: an intercepted soft navigation to `/properties/new`. A pasted link or a reload gets `properties/new/page.tsx`. */
export default function NewPropertySheet() {
  return (
    <SheetRoute path="/properties/new">
      <NewPropertyScreen variant="sheet" />
    </SheetRoute>
  );
}
