import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Field,
  LinkButton,
  Textarea,
  Button,
} from "@/components/ui";
import { fmtDate, fmtDateTime } from "@/lib/utils";
import { dealStatusTone } from "@/lib/config";
import { EditDeal } from "./edit-deal";
import { BackLink } from "@/components/back-link";
import { addDealNote } from "../actions";

export default async function DealPage({ params }: PageProps<"/deals/[id]">) {
  await requireUser();
  const { id } = await params;
  const deal = await prisma.deal.findUnique({
    where: { id },
    include: {
      notes: { orderBy: [{ noteDate: "desc" }, { createdAt: "desc" }] },
      tasks: { orderBy: { createdAt: "desc" } },
      convertedProperty: { select: { id: true, address: true } },
    },
  });
  if (!deal) notFound();

  const addNote = addDealNote.bind(null, deal.id);

  return (
    <>
      <div className="mb-4">
        <BackLink fallback="/deals" label="Acquisitions" />
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{deal.address}</h1>
          <Badge tone={dealStatusTone(deal.status)}>{deal.status}</Badge>
          {deal.priority && <Badge tone="amber">{deal.priority}</Badge>}
          {deal.vip && <Badge tone="purple">VIP</Badge>}
        </div>
        {deal.sourceUrl && (
          <a href={deal.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary">
            Listing ↗
          </a>
        )}
        {deal.convertedProperty && (
          <p className="mt-1 text-xs text-muted">
            Converted →{" "}
            <Link href={`/properties/${deal.convertedProperty.id}`} className="text-primary hover:underline">
              {deal.convertedProperty.address}
            </Link>
          </p>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Deal</CardTitle>
            </CardHeader>
            <CardBody>
              <EditDeal
                deal={{
                  id: deal.id,
                  version: deal.updatedAt.toISOString(),
                  status: deal.status,
                  priority: deal.priority,
                  theirPriceRaw: deal.theirPriceRaw,
                  ourPriceRaw: deal.ourPriceRaw,
                  nextAction: deal.nextAction,
                  nextActionDue: deal.nextActionDue
                    ? deal.nextActionDue.toISOString().slice(0, 10)
                    : null,
                  passReason: deal.passReason,
                }}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle>Activity timeline</CardTitle>
              <span className="text-xs text-muted">{deal.notes.length} entries</span>
            </CardHeader>
            <CardBody className="space-y-4">
              <form action={addNote} className="flex gap-2">
                <Textarea name="body" rows={2} placeholder="Add a note…" className="flex-1" />
                <Button type="submit" className="self-end">
                  Add
                </Button>
              </form>
              <ol className="relative space-y-3 border-l border-border pl-4">
                {deal.notes.map((n) => (
                  <li key={n.id} className="relative">
                    <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-border" />
                    <div className="text-xs text-muted">
                      {n.noteDate ? fmtDate(n.noteDate) : fmtDateTime(n.createdAt)}
                      {n.source === "manual" && <span className="ml-1">·  note</span>}
                    </div>
                    <p className="whitespace-pre-wrap text-sm">{n.body}</p>
                  </li>
                ))}
                {deal.notes.length === 0 && <li className="text-sm text-muted">No activity yet.</li>}
              </ol>
            </CardBody>
          </Card>

          {deal.rawLatestUpdates && (
            <Card>
              <CardHeader>
                <CardTitle>Original spreadsheet notes (verbatim)</CardTitle>
              </CardHeader>
              <CardBody>
                <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap text-xs text-muted">
                  {deal.rawLatestUpdates}
                </pre>
              </CardBody>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardBody>
              <dl>
                <Field label="Units">{deal.units ?? "—"}</Field>
                <Field label="Their price">{deal.theirPriceRaw ?? "—"}</Field>
                <Field label="Our price">{deal.ourPriceRaw ?? "—"}</Field>
                <Field label="Pass reason">{deal.passReason ?? "—"}</Field>
                <Field label="Added">{fmtDate(deal.createdAt)}</Field>
                <Field label="Updated">{fmtDate(deal.updatedAt)}</Field>
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle>Tasks</CardTitle>
              <LinkButton href={`/tasks/new?dealId=${deal.id}`} size="sm">
                + Task
              </LinkButton>
            </CardHeader>
            <CardBody className="p-0">
              {deal.tasks.length === 0 ? (
                <p className="p-4 text-sm text-muted">No tasks.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {deal.tasks.map((t) => (
                    <li key={t.id} className="px-4 py-2 text-sm">
                      <Link href={`/tasks/${t.id}`} className="hover:underline">
                        {t.status === "DONE" ? "✓ " : ""}
                        {t.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
