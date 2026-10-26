import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { BackLink } from "@/components/back-link";
import { PageHeader } from "@/components/ui";
import { todayYmdEastern } from "@/lib/dates";
import { propertyOptions } from "@/lib/picker-options";
import { activeTask, excludeTemplateTasks } from "@/lib/task-scope";
import { assigneeOptions } from "@/lib/tasks/assignee-options";
import { parseTemplateItems } from "@/lib/tasks/template-items";
import { ApplyFlow } from "./apply-flow";

/** Apply a playbook to a property (D28): property and unit, date and fill-ins, then the tasks, then create. */
export default async function ApplyPlaybookPage({ params, searchParams }: PageProps<"/templates/[id]/apply">) {
  const user = await requireUser();
  const { id } = await params;
  const sp = (await searchParams) as { property?: string };
  const template = await prisma.taskTemplate.findUnique({
    where: { id },
    select: { id: true, name: true, anchorLabel: true, items: true },
  });
  if (!template) notFound();
  const items = parseTemplateItems(template.items);
  const [{ users, contractors, recent }, properties, openRows] = await Promise.all([
    // Active people only: someone gone since the playbook was written shows as
    // unassigned here, as the service would create it.
    assigneeOptions([], user.id),
    propertyOptions(),
    // How many of this playbook's tasks are still open on each building, for the line above the list (BPLAY-V01).
    prisma.task.groupBy({
      by: ["propertyId"],
      where: { ...excludeTemplateTasks, ...activeTask, taskTemplateId: template.id, propertyId: { not: null } },
      _count: { _all: true },
    }),
  ]);
  const initialProperty = properties.some((p) => p.id === sp.property) ? sp.property! : null;
  const stillOpen: Record<string, number> = {};
  for (const r of openRows) if (r.propertyId) stillOpen[r.propertyId] = r._count._all;

  // A form, anchored to the sidebar like every page, at a width its rows read well at.
  return (
    <div className="max-w-3xl">
      <div className="mb-1">
        <BackLink fallback={`/templates${initialProperty ? `?property=${initialProperty}` : ""}`} label="Playbooks" />
      </div>
      <PageHeader title={template.name} />
      <ApplyFlow
        templateId={template.id}
        templateName={template.name}
        anchorLabel={template.anchorLabel?.trim() || "Start date"}
        items={items}
        properties={properties}
        stillOpen={stillOpen}
        initialPropertyId={initialProperty}
        users={users}
        contractors={contractors}
        recent={recent}
        meId={user.id}
        today={todayYmdEastern()}
      />
    </div>
  );
}

export const dynamic = "force-dynamic";
