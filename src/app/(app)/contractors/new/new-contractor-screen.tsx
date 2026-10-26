import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { tradeOptions } from "../query";
import { NewContractorForm } from "./new-contractor-form";

/**
 * New contractor for both routes that render it: `/contractors/new` as a page
 * and the intercepting route in the `@modal` slot as a sheet over the list
 * (`variant`). Trades offers every trade already in the directory.
 */
export async function NewContractorScreen({ variant }: { variant: "sheet" | "page" }) {
  await requireUser();
  const everyone = await prisma.contact.findMany({ select: { trades: true } });
  return <NewContractorForm variant={variant} trades={tradeOptions(everyone).map((t) => t.label)} />;
}
