import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NewContractorForm } from "./new-contractor-form";

/**
 * New contractor for both routes that render it: `/contractors/new` as a page
 * and the intercepting route in the `@modal` slot as a sheet over the list
 * (`variant`). Trades offers every trade on the list.
 */
export async function NewContractorScreen({ variant }: { variant: "sheet" | "page" }) {
  await requireUser();
  const trades = await prisma.trade.findMany({ select: { name: true }, orderBy: { name: "asc" } });
  return <NewContractorForm variant={variant} trades={trades.map((t) => t.name)} />;
}
