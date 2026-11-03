import { notFound } from "next/navigation";
import { after } from "next/server";
import { isActionRender } from "@/lib/action-render";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { preload } from "@/lib/preload";
import { recordView } from "@/lib/recent-views";
import { Section, TextLink } from "@/components/ui";
import { RailList } from "@/components/rail";
import { BackLink } from "@/components/back-link";
import { ArchivedNotice, RecordMoreMenu } from "@/components/record-archive";
import { archivedLine } from "@/lib/archive";
import { setDealArchived } from "../actions";
import { DealActivity, dealNotes } from "./deal-activity";
import { DealAddress, DealFact, DealListingLink, DealPassReason, DealPrice, DealStageRow, DealUnits } from "./deal-detail";
import type { Metadata } from "next";
import { recordMetadata } from "@/lib/record-metadata";

/** The tab names the record (record-title.ts), so tabs and history can be told apart. */
export async function generateMetadata({ params }: PageProps<"/deals/[id]">): Promise<Metadata> {
  return recordMetadata("deal", (await params).id);
}

export default async function DealPage({ params }: PageProps<"/deals/[id]">) {
  const { id } = await params;
  // Activity's notes start now, beside the deal; the session check runs with them and is awaited before anything shows.
  preload(dealNotes(id));
  const [user, deal] = await Promise.all([
    requireUser(),
    prisma.deal.findUnique({
      where: { id },
      include: {
        convertedProperty: { select: { id: true, address: true } },
        archivedByUser: { select: { name: true, email: true } },
      },
    }),
  ]);
  if (!deal) notFound();
  // Puts it on top of this person's Recent in search, once the response is out (not again for an edit's refresh).
  if (!(await isActionRender())) after(() => recordView(user.id, "DEAL", deal.id));

  return (
    // A record: 1200 wide at most, with the details in a 320 rail from lg (section 5).
    <div className="max-w-300">
      <div className="mb-8 pointer-coarse:mb-6">
        <BackLink fallback="/deals" label="Deals" />
        {/* The ⋯ menu is centered on the title's first line, as on a task's page: the heading's 4px padding and half its line, less half the 32px button (44 on touch). */}
        <div className="mt-1 flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <DealAddress id={deal.id} value={deal.address} />
          </div>
          <div className="shrink-0 pt-1 pointer-coarse:-mt-px pointer-coarse:pt-0">
            <RecordMoreMenu kind="deal" id={deal.id} href={`/deals/${deal.id}`} archived={!!deal.archivedAt} action={setDealArchived} />
          </div>
        </div>
        {deal.convertedProperty && (
          <p className="mt-1 text-meta text-fg-3">
            Converted to{" "}
            <TextLink href={`/properties/${deal.convertedProperty.id}`}>{deal.convertedProperty.address}</TextLink>
          </p>
        )}
        {deal.archivedAt && (
          <ArchivedNotice
            className="mt-4"
            kind="deal"
            id={deal.id}
            line={archivedLine(deal.archivedByUser, deal.archivedAt)}
            action={setDealArchived}
          />
        )}
      </div>

      <div className="grid grid-cols-1 gap-8 pointer-coarse:gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-10">
        {/* First in reading order, so a phone shows the deal before its history; the rail from lg. */}
        <aside className="min-w-0 lg:col-start-2 lg:row-start-1">
          <Section title="Details">
            {/* The stage, the two prices, the units, what's next and the listing: each changed where it stands. */}
            <RailList>
              <DealStageRow id={deal.id} status={deal.status} />
              <DealPrice id={deal.id} which="their" raw={deal.theirPriceRaw} />
              <DealPrice id={deal.id} which="our" raw={deal.ourPriceRaw} />
              <DealUnits id={deal.id} value={deal.units} />
              <DealFact id={deal.id} field="nextAction" label="Next action" kind="text" value={deal.nextAction} empty="Add next action" />
              <DealListingLink id={deal.id} value={deal.sourceUrl} />
              {deal.status === "Pass" && <DealPassReason id={deal.id} value={deal.passReason} />}
            </RailList>
          </Section>
        </aside>

        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          <DealActivity dealId={deal.id} />
        </div>
      </div>
    </div>
  );
}

export const dynamic = "force-dynamic";
