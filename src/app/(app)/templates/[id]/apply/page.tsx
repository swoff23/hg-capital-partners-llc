import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { BackLink } from "@/components/back-link";
import { PageHeader } from "@/components/ui";
import { todayYmdEastern } from "@/lib/dates";
import { shortAddress } from "@/lib/normalize";
import { assigneeOptions } from "@/lib/tasks/assignee-options";
import { parseTemplateItems } from "@/lib/tasks/template-items";
import { ApplyFlow } from "./apply-flow";

/** Apply a playbook to a property (D28): property, date and tokens, then review, then create. */
export default async function ApplyPlaybookPage({ params, searchParams }: PageProps<"/templates/[id]/apply">) {
  await requireUser();
  const { id } = await params;
  const sp = (await searchParams) as { property?: string };
  const template = await prisma.taskTemplate.findUnique({
    where: { id },
    select: { id: true, name: true, anchorLabel: true, items: true },
  });
  if (!template) notFound();
  const items = parseTemplateItems(template.items);
  const [{ users, contractors }, properties] = await Promise.all([
    // Active people only: someone gone since the playbook was written shows as
    // unassigned here, as the service would create it.
    assigneeOptions(),
    prisma.property.findMany({ orderBy: { address: "asc" }, select: { id: true, address: true } }),
  ]);
  const initialProperty = properties.some((p) => p.id === sp.property) ? sp.property! : null;

  // A form, anchored to the sidebar like every page, at a width its rows read well at.
  return (
    <div className="max-w-3xl">
      <div className="mb-1">
        <BackLink fallback={`/templates${initialProperty ? `?property=${initialProperty}` : ""}`} label="Playbooks" />
      </div>
      <PageHeader title={template.name} />
      <ApplyFlow
        templateId={template.id}
        anchorLabel={template.anchorLabel?.trim() || "Start date"}
        items={items}
        properties={properties.map((p) => ({ id: p.id, label: shortAddress(p.address) }))}
        initialPropertyId={initialProperty}
        users={users}
        contractors={contractors}
        today={todayYmdEastern()}
      />
    </div>
  );
}

export const dynamic = "force-dynamic";
