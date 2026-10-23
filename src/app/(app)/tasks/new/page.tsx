import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Button, Card, CardBody, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { todayYmdEastern } from "@/lib/dates";
import { shortAddress } from "@/lib/normalize";
import { assigneeOptions } from "@/lib/tasks/assignee-options";
import { createTask } from "../actions";
import { NewTaskFields } from "./new-task-fields";

export default async function NewTaskPage({ searchParams }: PageProps<"/tasks/new">) {
  const user = await requireUser();
  const sp = (await searchParams) as { propertyId?: string; dealId?: string };
  const [{ users, contractors }, properties, deal, property] = await Promise.all([
    assigneeOptions(),
    prisma.property.findMany({ select: { id: true, address: true }, orderBy: { address: "asc" } }),
    sp.dealId ? prisma.deal.findUnique({ where: { id: sp.dealId }, select: { id: true, address: true } }) : null,
    sp.propertyId
      ? prisma.property.findUnique({ where: { id: sp.propertyId }, select: { id: true, address: true } })
      : null,
  ]);

  return (
    <>
      <PageHeader
        title="New task"
        subtitle={deal ? `For deal ${deal.address}` : property ? `For ${property.address}` : undefined}
      />
      <Card className="max-w-xl">
        <CardBody>
          <form action={createTask} className="space-y-4">
            {sp.dealId && <input type="hidden" name="dealId" value={sp.dealId} />}
            <label className="block">
              <span className="text-xs font-medium text-muted">Title *</span>
              <Input name="title" required className="mt-1" autoFocus />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-muted">Description</span>
              <Textarea name="description" rows={4} className="mt-1" />
            </label>
            <NewTaskFields
              users={users}
              contractors={contractors}
              defaultAssignee={{ userId: user.id }}
              today={todayYmdEastern()}
            />
            {!sp.dealId && (
              <label className="block">
                <span className="text-xs font-medium text-muted">Property</span>
                <Select name="propertyId" defaultValue={sp.propertyId ?? ""} className="mt-1">
                  <option value="">None</option>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {shortAddress(p.address)}
                    </option>
                  ))}
                </Select>
              </label>
            )}
            <Button type="submit">Create task</Button>
          </form>
        </CardBody>
      </Card>
    </>
  );
}
