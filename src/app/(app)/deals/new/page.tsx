import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { NewDealForm } from "./new-deal-form";

export default async function NewDealPage({ searchParams }: PageProps<"/deals/new">) {
  await requireUser();
  // 'Add "12 Elmwood Ter" as a deal' in search (docs/specs/search.md 2.6) lands here with the address filled in.
  const { address } = (await searchParams) as { address?: string | string[] };
  return (
    // A form on the page itself, no card around it (section 9, Cards and sections).
    <div className="max-w-xl">
      <PageHeader title="New deal" />
      <NewDealForm defaultAddress={typeof address === "string" ? address.trim().slice(0, 200) : undefined} />
    </div>
  );
}
