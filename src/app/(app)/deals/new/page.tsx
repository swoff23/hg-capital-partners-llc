import { requireUser } from "@/lib/auth";
import { Card, CardBody, PageHeader } from "@/components/ui";
import { NewDealForm } from "./new-deal-form";

export default async function NewDealPage() {
  await requireUser();
  return (
    <>
      <PageHeader title="New deal" />
      <Card className="max-w-xl">
        <CardBody>
          <NewDealForm />
        </CardBody>
      </Card>
    </>
  );
}
