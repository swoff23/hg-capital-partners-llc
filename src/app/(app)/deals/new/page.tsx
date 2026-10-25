import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { NewDealForm } from "./new-deal-form";

export default async function NewDealPage() {
  await requireUser();
  return (
    // A form on the page itself, no card around it (section 9, Cards and sections).
    <div className="max-w-xl">
      <PageHeader title="New deal" />
      <NewDealForm />
    </div>
  );
}
