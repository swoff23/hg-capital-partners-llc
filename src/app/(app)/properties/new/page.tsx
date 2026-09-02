import { requireUser } from "@/lib/auth";
import { Button, Card, CardBody, Input, PageHeader, Select } from "@/components/ui";
import { PROPERTY_STATUSES } from "@/lib/config";
import { createProperty } from "../actions";

export default async function NewPropertyPage() {
  await requireUser();
  return (
    <>
      <PageHeader title="New property" />
      <Card className="max-w-xl">
        <CardBody>
          <form action={createProperty} className="space-y-4">
            <label className="block">
              <span className="text-xs font-medium text-muted">Address *</span>
              <Input name="address" required placeholder="123 Main St, Buffalo, NY 14201" className="mt-1" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-medium text-muted">Status</span>
                <Select name="status" defaultValue="" className="mt-1">
                  <option value="">— none</option>
                  {PROPERTY_STATUSES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </Select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-muted">Entity</span>
                <Input name="llcOwner" placeholder="LLC owner" className="mt-1" />
              </label>
            </div>
            <Button type="submit">Create property</Button>
          </form>
        </CardBody>
      </Card>
    </>
  );
}
