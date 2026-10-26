import { notFound } from "next/navigation";
import { after } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordView } from "@/lib/recent-views";
import { Button, Section, Textarea, TextLink } from "@/components/ui";
import { cn, fmtDateTime } from "@/lib/utils";
import { todayYmdEastern } from "@/lib/dates";
import { BackLink } from "@/components/back-link";
import { ActivityItem, ActivityTimeline } from "@/components/activity-timeline";
import { addDealNote } from "../actions";
import { DealPriceField, DealStageField, DealTextField, DealUnitsField } from "../deal-fields";
import { noteDay } from "../format";
import { AddressField, ListingUrlField, PassReasonControl } from "./deal-detail";

/** A details row: a 112px label column (96px on phones) beside the value, on a hairline (section 5). */
function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-10 grid-cols-[6rem_minmax(0,1fr)] items-center gap-3 border-b border-line py-1 last:border-0 sm:grid-cols-[7rem_minmax(0,1fr)] pointer-coarse:min-h-12">
      <dt className="text-meta text-fg-3">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

export default async function DealPage({ params }: PageProps<"/deals/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const deal = await prisma.deal.findUnique({
    where: { id },
    include: {
      // Undated imported lines go last, as on the list; Postgres would put them first.
      notes: { orderBy: [{ noteDate: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }] },
      convertedProperty: { select: { id: true, address: true } },
    },
  });
  if (!deal) notFound();
  // Puts it on top of this person's Recent in search, once the response is out.
  after(() => recordView(user.id, "DEAL", deal.id));

  const addNote = addDealNote.bind(null, deal.id);
  const today = todayYmdEastern();
  const field = "h-8";

  return (
    // A record: 1200 wide at most, with the details in a 320 rail from lg (section 5).
    <div className="max-w-300">
      <div className="mb-8 pointer-coarse:mb-6">
        <BackLink fallback="/deals" label="Deals" />
        <div className="mt-1">
          <AddressField id={deal.id} value={deal.address} />
        </div>
        {deal.convertedProperty && (
          <p className="mt-1 text-meta text-fg-3">
            Converted to{" "}
            <TextLink href={`/properties/${deal.convertedProperty.id}`}>{deal.convertedProperty.address}</TextLink>
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-8 pointer-coarse:gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-10">
        {/* First in reading order, so a phone shows the deal before its history; the rail from lg. */}
        <aside className="min-w-0 lg:col-start-2 lg:row-start-1">
          <Section title="Details">
            <dl>
              <DetailRow label="Status">
                <DealStageField id={deal.id} status={deal.status} fieldSize="sm" />
              </DetailRow>
              <DetailRow label="Their price">
                <DealPriceField
                  id={deal.id}
                  which="their"
                  raw={deal.theirPriceRaw}
                  amount={deal.theirPrice ? Number(deal.theirPrice) : null}
                  emptyLabel="Add their price"
                  className={field}
                />
              </DetailRow>
              <DetailRow label="Our price">
                <DealPriceField
                  id={deal.id}
                  which="our"
                  raw={deal.ourPriceRaw}
                  amount={deal.ourPrice ? Number(deal.ourPrice) : null}
                  emptyLabel="Add our price"
                  className={field}
                />
              </DetailRow>
              <DetailRow label="Units">
                <DealUnitsField id={deal.id} value={deal.units} emptyLabel="Add units" className={field} />
              </DetailRow>
              <DetailRow label="Next action">
                <DealTextField
                  id={deal.id}
                  value={deal.nextAction}
                  patchKey="nextAction"
                  label="Next action"
                  placeholder="Add next action"
                  className={field}
                />
              </DetailRow>
              <DetailRow label="Listing URL">
                <ListingUrlField id={deal.id} value={deal.sourceUrl} />
              </DetailRow>
              {deal.status === "Pass" && (
                <DetailRow label="Pass reason">
                  <PassReasonControl id={deal.id} value={deal.passReason} />
                </DetailRow>
              )}
            </dl>
          </Section>
        </aside>

        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          <Section
            title={
              <>
                Activity
                <span className="num ml-1.5 text-meta text-fg-3">{deal.notes.length}</span>
              </>
            }
          >
            <form action={addNote} className="flex items-end gap-2">
              <Textarea name="body" rows={2} placeholder="Add a note…" aria-label="Add a note" className="flex-1" />
              <Button type="submit">Add</Button>
            </form>
            <ActivityTimeline className="mt-4">
              {deal.notes.map((n) => {
                const isChange = n.source === "change";
                return (
                  <ActivityItem key={n.id} marker={isChange ? "muted" : "primary"}>
                    <div className="num text-meta text-fg-3">
                      {n.noteDate
                        ? noteDay({ noteDate: n.noteDate, source: n.source }, today)
                        : fmtDateTime(n.createdAt)}
                      {n.source === "manual" && " · note"}
                      {n.source === "migration" && " · imported"}
                    </div>
                    <p
                      className={cn(
                        "whitespace-pre-wrap text-pretty [overflow-wrap:anywhere]",
                        isChange ? "text-meta text-fg-2" : "text-body text-fg-1",
                      )}
                    >
                      {n.body}
                    </p>
                  </ActivityItem>
                );
              })}
              {deal.notes.length === 0 && <li className="text-body text-fg-3">No activity yet.</li>}
            </ActivityTimeline>
          </Section>
        </div>
      </div>
    </div>
  );
}

export const dynamic = "force-dynamic";
