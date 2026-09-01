import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Button, Card, CardBody, CardHeader, CardTitle, Textarea } from "@/components/ui";
import { fmtDate, fmtDateTime } from "@/lib/utils";
import { BackLink } from "@/components/back-link";
import { addDealNote } from "../actions";
import {
  AddressField,
  StatusControl,
  PassReasonControl,
  PriceField,
  UnitsField,
  NextActionField,
  ListingUrlField,
} from "./deal-detail";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[2.75rem] items-center gap-4 border-b border-border/60 last:border-0">
      <dt className="w-32 shrink-0 text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );
}

export default async function DealPage({ params }: PageProps<"/deals/[id]">) {
  await requireUser();
  const { id } = await params;
  const deal = await prisma.deal.findUnique({
    where: { id },
    include: {
      notes: { orderBy: [{ noteDate: "desc" }, { createdAt: "desc" }] },
      convertedProperty: { select: { id: true, address: true } },
    },
  });
  if (!deal) notFound();

  const addNote = addDealNote.bind(null, deal.id);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4">
        <BackLink fallback="/deals" label="Deals" />
        <div className="mt-1">
          <AddressField id={deal.id} value={deal.address} />
        </div>
        {deal.convertedProperty && (
          <p className="mt-1 text-xs text-muted">
            Converted →{" "}
            <Link href={`/properties/${deal.convertedProperty.id}`} className="text-primary hover:underline">
              {deal.convertedProperty.address}
            </Link>
          </p>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Deal</CardTitle>
        </CardHeader>
        <CardBody>
          <dl className="rounded-lg border border-border px-3">
            <Row label="Status">
              <StatusControl id={deal.id} status={deal.status} />
            </Row>
            <Row label="Their price">
              <PriceField id={deal.id} value={deal.theirPriceRaw} which="their" />
            </Row>
            <Row label="Our price">
              <PriceField id={deal.id} value={deal.ourPriceRaw} which="our" />
            </Row>
            <Row label="Units">
              <UnitsField id={deal.id} value={deal.units} />
            </Row>
            <Row label="Next action">
              <NextActionField id={deal.id} value={deal.nextAction} />
            </Row>
            <Row label="Listing URL">
              <ListingUrlField id={deal.id} value={deal.sourceUrl} />
            </Row>
            {deal.status === "Pass" && (
              <Row label="Pass reason">
                <PassReasonControl id={deal.id} value={deal.passReason} />
              </Row>
            )}
          </dl>
        </CardBody>
      </Card>

      <Card className="mt-4">
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
          <ol className="relative max-h-[520px] space-y-2.5 overflow-y-auto border-l border-border pl-4">
            {deal.notes.map((n) => {
              const isChange = n.source === "change";
              return (
                <li key={n.id} className="relative">
                  <span
                    className={`absolute -left-[21px] top-1.5 h-1.5 w-1.5 rounded-full ${
                      isChange ? "bg-border" : "bg-primary"
                    }`}
                  />
                  <div className="text-[11px] text-muted">
                    {n.noteDate ? fmtDate(n.noteDate) : fmtDateTime(n.createdAt)}
                    {n.source === "manual" && <span className="ml-1">· note</span>}
                    {n.source === "migration" && <span className="ml-1">· imported</span>}
                  </div>
                  <p
                    className={
                      isChange ? "whitespace-pre-wrap text-xs text-muted" : "whitespace-pre-wrap text-sm"
                    }
                  >
                    {n.body}
                  </p>
                </li>
              );
            })}
            {deal.notes.length === 0 && <li className="text-sm text-muted">No activity yet.</li>}
          </ol>
        </CardBody>
      </Card>
    </div>
  );
}

export const dynamic = "force-dynamic";
