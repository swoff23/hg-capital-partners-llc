import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { NewPropertyForm } from "./new-property-form";

/** A short form, flat on the page: cards are for Home and Overview modules (docs/brand-guidelines.md, section 9). */
export default async function NewPropertyPage() {
  await requireUser();
  return (
    <div className="max-w-xl">
      <PageHeader title="New property" />
      <NewPropertyForm />
    </div>
  );
}
