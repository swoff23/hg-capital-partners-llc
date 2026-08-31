import { requireUser } from "@/lib/auth";
import { Button, Card, CardBody, Input, PageHeader, Select } from "@/components/ui";
import { DEAL_STATUSES } from "@/lib/config";
import { createDeal } from "../actions";

export default async function NewDealPage() {
  await requireUser();
  return (
    <>
      <PageHeader title="New deal" />
      <Card className="max-w-xl">
        <CardBody>
          <form action={createDeal} className="space-y-4">
            <label className="block">
              <span className="text-xs font-medium text-muted">Address *</span>
              <Input name="address" required placeholder="123 Main St, Buffalo, NY 14201" className="mt-1" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-medium text-muted">Status</span>
                <Select name="status" defaultValue="Active" className="mt-1">
                  {DEAL_STATUSES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </Select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-muted">Units</span>
                <Input name="units" type="number" min="1" className="mt-1" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-muted">Their price</span>
                <Input name="theirPriceRaw" placeholder="425k" className="mt-1" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-muted">Our price (target/max)</span>
                <Input name="ourPriceRaw" placeholder="380k" className="mt-1" />
              </label>
            </div>
            <label className="block">
              <span className="text-xs font-medium text-muted">Listing URL</span>
              <Input name="sourceUrl" type="url" placeholder="https://…" className="mt-1" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-muted">Next action</span>
              <Input name="nextAction" placeholder="Run comps, schedule tour…" className="mt-1" />
            </label>
            <Button type="submit">Create deal</Button>
          </form>
        </CardBody>
      </Card>
    </>
  );
}
