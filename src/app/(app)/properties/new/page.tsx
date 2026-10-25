import { requireUser } from "@/lib/auth";
import { Card, CardBody, PageHeader } from "@/components/ui";
import { NewPropertyForm } from "./new-property-form";

export default async function NewPropertyPage() {
  await requireUser();
  return (
    <>
      <PageHeader title="New property" />
      <Card className="max-w-xl">
        <CardBody>
          <NewPropertyForm />
        </CardBody>
      </Card>
    </>
  );
}
