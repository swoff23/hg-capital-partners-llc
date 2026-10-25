import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Button, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { todayYmdEastern } from "@/lib/dates";
import { shortAddress } from "@/lib/normalize";
import { assigneeOptions } from "@/lib/tasks/assignee-options";
import { createTask } from "../actions";
import { NewTaskFields } from "./new-task-fields";

/** New task: a flat form under the title, no box (docs/brand-guidelines.md, section 9). */
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
      <form action={createTask} className="max-w-xl space-y-4">
        {sp.dealId && <input type="hidden" name="dealId" value={sp.dealId} />}
        <label className="block">
          <span className="text-meta font-medium text-fg-2">Title *</span>
          <Input name="title" required className="mt-1.5" autoFocus />
        </label>
        <label className="block">
          <span className="text-meta font-medium text-fg-2">Description</span>
          <Textarea name="description" rows={4} className="mt-1.5" />
        </label>
        <NewTaskFields
          users={users}
          contractors={contractors}
          defaultAssignee={{ userId: user.id }}
          meId={user.id}
          today={todayYmdEastern()}
        />
        {!sp.dealId && (
          <label className="block">
            <span className="text-meta font-medium text-fg-2">Property</span>
            <Select name="propertyId" defaultValue={sp.propertyId ?? ""} className="mt-1.5">
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
    </>
  );
}
