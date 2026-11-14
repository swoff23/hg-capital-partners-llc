import { requireUser } from "@/lib/auth";
import { NewPropertyForm } from "./new-property-form";

/**
 * New property for both routes that render it: `/properties/new` as a page
 * and the intercepting route in the `@modal` slot as a sheet over Portfolio
 * (`variant`). The Entity field lists the five companies (ENTITY_NAMES).
 */
export async function NewPropertyScreen({ variant }: { variant: "sheet" | "page" }) {
  await requireUser();
  return <NewPropertyForm variant={variant} />;
}
