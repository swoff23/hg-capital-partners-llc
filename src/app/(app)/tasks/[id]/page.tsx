import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui";
import { BackLink } from "@/components/back-link";
import { toYmd } from "@/lib/dates";
import {
  AssigneeControl,
  AttachmentsSection,
  CompleteButton,
  DescriptionField,
  DueDateControl,
  PropertyControl,
  TitleField,
} from "./task-detail";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[2.75rem] items-center gap-4 border-b border-border/60 last:border-0">
      <dt className="w-24 shrink-0 text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );
}

export default async function TaskPage({ params }: PageProps<"/tasks/[id]">) {
  await requireUser();
  const { id } = await params;
  const [task, users, properties] = await Promise.all([
    prisma.task.findUnique({
      where: { id },
      include: {
        assignee: { select: { name: true, email: true } },
        attachments: { orderBy: { createdAt: "asc" } },
      },
    }),
    prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, email: true } }),
    prisma.property.findMany({ select: { id: true, address: true }, orderBy: { address: "asc" } }),
  ]);
  if (!task) notFound();

  const done = task.status === "DONE";
  const assigneeLabel =
    task.assignee?.name ?? task.assignee?.email ?? task.assigneeName ?? null;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-3">
        <BackLink fallback="/tasks" label="Tasks" />
      </div>

      <Card>
        <CardHeader>
          <CompleteButton id={task.id} done={done} />
        </CardHeader>

        <CardBody className="space-y-4">
          <TitleField id={task.id} value={task.title} done={done} />

          <dl className="rounded-lg border border-border px-3">
            <Row label="Assignee">
              <AssigneeControl
                id={task.id}
                value={task.assigneeUserId}
                label={assigneeLabel}
                users={users}
              />
            </Row>
            <Row label="Due date">
              <DueDateControl
                id={task.id}
                value={toYmd(task.dueDate)}
              />
            </Row>
            <Row label="Project">
              <PropertyControl id={task.id} value={task.propertyId} properties={properties} />
            </Row>
          </dl>
        </CardBody>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Description</CardTitle>
        </CardHeader>
        <CardBody>
          <DescriptionField id={task.id} value={task.description} />
        </CardBody>
      </Card>

      <Card className="mt-4">
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Attachments</CardTitle>
          {task.attachments.length > 0 && (
            <span className="text-xs text-muted">{task.attachments.length}</span>
          )}
        </CardHeader>
        <CardBody>
          <AttachmentsSection taskId={task.id} attachments={task.attachments} />
        </CardBody>
      </Card>
    </div>
  );
}

export const dynamic = "force-dynamic";
