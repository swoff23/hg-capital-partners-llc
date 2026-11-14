import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { uniqueEntities } from "@/lib/properties/entities";

/**
 * One property's own row, without its relations. `cache()` de-dupes within a
 * request, as getAppConfig does: the record page, its Documents section and
 * its Financials card each ask for it, and they share one query.
 */
export const getPropertyById = cache((id: string) => prisma.property.findUnique({ where: { id } }));

/**
 * The entities already on properties, for the Entity field's suggestions (New
 * property and a property's Details). `cache()` de-dupes within a request.
 */
export const getEntityNames = cache(async (): Promise<string[]> => {
  const rows = await prisma.property.findMany({
    where: { llcOwner: { not: null } },
    select: { llcOwner: true },
    distinct: ["llcOwner"],
    orderBy: { llcOwner: "asc" },
  });
  return uniqueEntities(rows.map((r) => r.llcOwner));
});
