import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { todayYmdEastern } from "@/lib/dates";
import { propertyOptions } from "@/lib/picker-options";
import { shortAddress } from "@/lib/normalize";
import { assigneeOptions } from "@/lib/tasks/assignee-options";
import { NewTaskForm, type NewTaskContext } from "./new-task-fields";

/**
 * Everything New task needs from the server, then the form. Two routes render
 * it: `/tasks/new` as a page, and the intercepting route in the `@modal` slot
 * as a sheet over wherever the link was clicked (`variant`). `?propertyId=` and
 * `?dealId=` say what the task is about.
 */
export async function NewTaskScreen({
  variant,
  searchParams,
}: {
  variant: "sheet" | "page";
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);
  const propertyId = one(sp.propertyId);
  const dealId = one(sp.dealId);

  const [{ users, contractors, recent }, properties, deal] = await Promise.all([
    assigneeOptions([], user.id),
    propertyOptions(),
    dealId ? prisma.deal.findUnique({ where: { id: dealId }, select: { id: true, address: true } }) : null,
  ]);

  // A deal wins over a property when both are asked for: the task is about the deal.
  const property = !deal && propertyId ? properties.find((p) => p.id === propertyId) : undefined;
  const context: NewTaskContext | null = deal
    ? { kind: "deal", id: deal.id, label: shortAddress(deal.address) }
    : property
      ? { kind: "property", id: property.id, label: property.label }
      : null;

  return (
    <NewTaskForm
      variant={variant}
      users={users}
      contractors={contractors}
      recent={recent}
      properties={properties}
      context={context}
      meId={user.id}
      today={todayYmdEastern()}
    />
  );
}
