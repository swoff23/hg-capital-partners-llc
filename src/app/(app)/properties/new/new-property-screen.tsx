import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NewPropertyForm } from "./new-property-form";

/**
 * New property for both routes that render it: `/properties/new` as a page
 * and the intercepting route in the `@modal` slot as a sheet over Portfolio
 * (`variant`). The Entity field offers the entities already on properties.
 */
export async function NewPropertyScreen({ variant }: { variant: "sheet" | "page" }) {
  await requireUser();
  const rows = await prisma.property.findMany({
    where: { llcOwner: { not: null } },
    select: { llcOwner: true },
    distinct: ["llcOwner"],
    orderBy: { llcOwner: "asc" },
  });
  const entities = rows.map((r) => r.llcOwner?.trim() ?? "").filter(Boolean);
  return <NewPropertyForm variant={variant} entities={[...new Set(entities)]} />;
}
