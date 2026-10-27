import { NewPropertyScreen } from "./new-property-screen";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "New property" };

/** New property as a page: a pasted link or a reload. A click inside the app opens it as a sheet over Portfolio (`@modal/(.)properties/new`). */
export default function NewPropertyPage() {
  return <NewPropertyScreen variant="page" />;
}
