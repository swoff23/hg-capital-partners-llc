import { requireUser } from "@/lib/auth";
import { getEntityNames } from "@/lib/properties/read";
import { NewPropertyForm } from "./new-property-form";

/**
 * New property for both routes that render it: `/properties/new` as a page
 * and the intercepting route in the `@modal` slot as a sheet over Portfolio
 * (`variant`). The Entity field offers the entities already on properties.
 */
export async function NewPropertyScreen({ variant }: { variant: "sheet" | "page" }) {
  await requireUser();
  const entities = await getEntityNames();
  return <NewPropertyForm variant={variant} entities={entities} />;
}
