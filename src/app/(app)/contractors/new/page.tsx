import { NewContractorScreen } from "./new-contractor-screen";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "New contractor" };

/** New contractor as a page: a pasted link or a reload. A click inside the app opens it as a sheet over the list (`@modal/(.)contractors/new`). */
export default function NewContractorPage() {
  return <NewContractorScreen variant="page" />;
}
