import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { tradeOptions } from "../query";
import { NewContractorSheet } from "./new-contractor-sheet";

/**
 * New contractor as a page of its own: what a pasted link or a reload opens.
 * A click on "New contractor" in the directory opens the same form as a sheet
 * over the list instead (the `(.)contractors/new` route in the `@modal` slot),
 * so closing either goes back to the Contractors list.
 */
export default async function NewContractorPage() {
  await requireUser();
  const everyone = await prisma.contact.findMany({ select: { trades: true } });
  return <NewContractorSheet trades={tradeOptions(everyone).map((t) => t.label)} />;
}
