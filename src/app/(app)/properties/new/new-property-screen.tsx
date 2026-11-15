import { requireUser } from "@/lib/auth";
import { getEntityChoices } from "@/lib/properties/read";
import { NewPropertyForm } from "./new-property-form";

/**
 * New property for both routes that render it: `/properties/new` as a page
 * and the intercepting route in the `@modal` slot as a sheet over Portfolio
 * (`variant`). The Entity field lists the companies and the names added on
 * any property (lib/properties/entity.ts entityChoices).
 */
export async function NewPropertyScreen({ variant }: { variant: "sheet" | "page" }) {
  const [, entities] = await Promise.all([requireUser(), getEntityChoices()]);
  return <NewPropertyForm variant={variant} entities={entities} />;
}
