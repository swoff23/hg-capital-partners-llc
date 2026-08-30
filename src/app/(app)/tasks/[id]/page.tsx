import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Badge, Card, CardBody, CardHeader, CardTitle } from "@/components/ui";
import { BackLink } from "@/components/back-link";
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
        property: { select: { id: true, address: true } },
        deal: { select: { id: true, address: true } },
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
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <CompleteButton id={task.id} done={done} />
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={done ? "green" : "blue"}>{done ? "Completed" : "Open"}</Badge>
            {task.property ? (
              <Link href={`/properties/${task.property.id}`}>
                <Badge tone="gray">{task.property.address.split(",")[0]}</Badge>
              </Link>
            ) : task.deal ? (
              <Link href={`/deals/${task.deal.id}`}>
                <Badge tone="gray">deal · {task.deal.address.split(",")[0]}</Badge>
              </Link>
            ) : (
              <Badge tone="gray">{task.bucket}</Badge>
            )}
          </div>
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
                value={task.dueDate ? task.dueDate.toISOString().slice(0, 10) : null}
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
