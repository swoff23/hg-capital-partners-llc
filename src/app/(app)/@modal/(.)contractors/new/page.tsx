import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { tradeOptions } from "../../../contractors/query";
import { NewContractorSheet } from "../../../contractors/new/new-contractor-sheet";

/**
 * New contractor over the page it was opened from (forms 3, intercepting
 * routes in the `@modal` slot): a click opens it as a sheet, and Back closes
 * it. A pasted link or a reload never gets here; it opens
 * `contractors/new/page.tsx`, the same form on a page.
 */
export default async function NewContractorModal() {
  await requireUser();
  const everyone = await prisma.contact.findMany({ select: { trades: true } });
  return <NewContractorSheet trades={tradeOptions(everyone).map((t) => t.label)} />;
}
