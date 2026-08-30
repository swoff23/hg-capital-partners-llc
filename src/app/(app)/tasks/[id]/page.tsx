import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Badge, Card, CardBody, CardHeader, CardTitle, Field, Button, Input, Select, Textarea } from "@/components/ui";
import { fmtDate, fmtDateTime } from "@/lib/utils";
import { updateTask } from "../actions";
import { TaskCheckbox } from "../task-checkbox";
import { BackLink } from "@/components/back-link";

export default async function TaskPage({ params }: PageProps<"/tasks/[id]">) {
  await requireUser();
  const { id } = await params;
  const [task, users, properties] = await Promise.all([
    prisma.task.findUnique({
      where: { id },
      include: {
        property: { select: { id: true, address: true } },
        deal: { select: { id: true, address: true } },
        assignee: { select: { name: true } },
      },
    }),
    prisma.user.findMany({ orderBy: { name: "asc" } }),
    prisma.property.findMany({ select: { id: true, address: true }, orderBy: { address: "asc" } }),
  ]);
  if (!task) notFound();

  const save = updateTask.bind(null, task.id);

  return (
    <>
      <div className="mb-4">
        <BackLink fallback="/tasks" label="Tasks" />
        <div className="mt-1 flex items-start gap-3">
          <div className="pt-1">
            <TaskCheckbox id={task.id} done={task.status === "DONE"} />
          </div>
          <h1 className={`text-xl font-semibold tracking-tight ${task.status === "DONE" ? "text-muted line-through" : ""}`}>
            {task.title}
          </h1>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 pl-7 text-xs text-muted">
          <Badge tone={task.status === "DONE" ? "green" : "blue"}>{task.status}</Badge>
          <Badge tone="gray">{task.bucket}</Badge>
          {task.property && (
            <Link href={`/properties/${task.property.id}`} className="text-primary hover:underline">
              {task.property.address}
            </Link>
          )}
          {task.deal && (
            <Link href={`/deals/${task.deal.id}`} className="text-primary hover:underline">
              deal: {task.deal.address}
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Edit</CardTitle>
          </CardHeader>
          <CardBody>
            <form action={save} className="space-y-3" key={task.updatedAt.toISOString()}>
              <label className="block">
                <span className="text-xs font-medium text-muted">Title</span>
                <Input name="title" defaultValue={task.title} className="mt-1" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-muted">Description</span>
                <Textarea name="description" rows={5} defaultValue={task.description ?? ""} className="mt-1" />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-medium text-muted">Assignee (internal)</span>
                  <Select name="assigneeUserId" defaultValue={task.assigneeUserId ?? ""} className="mt-1">
                    <option value="">— {task.assigneeName ? `(${task.assigneeName})` : "unassigned"}</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name ?? u.email}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-muted">Due date</span>
                  <Input
                    name="dueDate"
                    type="date"
                    defaultValue={task.dueDate ? task.dueDate.toISOString().slice(0, 10) : ""}
                    className="mt-1"
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-muted">Property</span>
                  <Select name="propertyId" defaultValue={task.propertyId ?? ""} className="mt-1">
                    <option value="">— none</option>
                    {properties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.address}
                      </option>
                    ))}
                  </Select>
                </label>
              </div>
              <Button type="submit">Save</Button>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Meta</CardTitle>
          </CardHeader>
          <CardBody>
            <dl>
              <Field label="External assignee">{task.assigneeName ?? "—"}</Field>
              <Field label="Assignee email">{task.assigneeEmail ?? "—"}</Field>
              <Field label="Asana section">{task.sectionRaw ?? "—"}</Field>
              <Field label="Created">{fmtDate(task.createdAt)}</Field>
              <Field label="Completed">{task.completedAt ? fmtDateTime(task.completedAt) : "—"}</Field>
              <Field label="Asana ID">{task.asanaId ?? "—"}</Field>
            </dl>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
