import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { BackLink } from "@/components/back-link";
import { EmptyState, PageHeader } from "@/components/ui";
import { shortAddress } from "@/lib/normalize";
import { parseTemplateItems } from "@/lib/tasks/template-items";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Playbooks" };

/**
 * Playbooks (D28): the task templates imported from Asana. Pick one to apply
 * it to a property. `?property=<id>` carries the property from its page. A
 * list page, so it runs full width from the sidebar, its rows flat over
 * hairlines (docs/brand-guidelines.md, section 5); each whole row opens the
 * playbook, with an 8px hover fill past each side.
 */
export default async function TemplatesPage({ searchParams }: PageProps<"/templates">) {
  await requireUser();
  const sp = (await searchParams) as { property?: string };
  const [templates, property] = await Promise.all([
    prisma.taskTemplate.findMany({
      where: { archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, items: true },
    }),
    sp.property ? prisma.property.findUnique({ where: { id: sp.property }, select: { id: true, address: true } }) : null,
  ]);
  const query = property ? `?property=${encodeURIComponent(property.id)}` : "";

  return (
    <>
      {property && (
        <div className="mb-1">
          <BackLink fallback={`/properties/${property.id}`} label={shortAddress(property.address)} />
        </div>
      )}
      <PageHeader title="Playbooks" subtitle={property ? `Apply one to ${shortAddress(property.address)}` : undefined} />
      {templates.length === 0 ? (
        <EmptyState>No playbooks yet.</EmptyState>
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {templates.map((t) => {
            const count = parseTemplateItems(t.items).length;
            return (
              <li key={t.id}>
                <Link
                  href={`/templates/${t.id}/apply${query}`}
                  className="-mx-2 flex min-h-10 items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-fill-1 pointer-coarse:min-h-12"
                >
                  <span className="min-w-0 flex-1 truncate text-body text-fg-1">{t.name}</span>
                  <span className="shrink-0 text-meta tabular-nums text-fg-3">
                    {count} {count === 1 ? "task" : "tasks"}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-fg-3" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

export const dynamic = "force-dynamic";
