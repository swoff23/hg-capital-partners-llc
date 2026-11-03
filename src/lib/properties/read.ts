import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db";

/**
 * One property's own row, without its relations. `cache()` de-dupes within a
 * request, as getAppConfig does: the record page, its Documents section and
 * its Financials card each ask for it, and they share one query.
 */
export const getPropertyById = cache((id: string) => prisma.property.findUnique({ where: { id } }));
