import { requireUser } from "@/lib/auth";
import { NewDealForm } from "./new-deal-form";

/**
 * New deal for both routes that render it: `/deals/new` as a page and the
 * intercepting route in the `@modal` slot as a sheet over the list (`variant`).
 * 'Add "12 Elmwood Ter" as a deal' in search (docs/specs/search.md 2.6) lands
 * here with `?address=` filled in.
 */
export async function NewDealScreen({
  variant,
  searchParams,
}: {
  variant: "sheet" | "page";
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireUser();
  const { address } = await searchParams;
  return <NewDealForm variant={variant} defaultAddress={typeof address === "string" ? address.trim().slice(0, 200) || undefined : undefined} />;
}
