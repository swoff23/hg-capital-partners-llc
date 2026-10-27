import { notFound } from "next/navigation";
import { after } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordView } from "@/lib/recent-views";
import { Section, TextLink } from "@/components/ui";
import { RailList } from "@/components/rail";
import { BackLink } from "@/components/back-link";
import { DealActivity } from "./deal-activity";
import { DealAddress, DealFact, DealListingLink, DealPassReason, DealPrice, DealStageRow, DealUnits } from "./deal-detail";
import type { Metadata } from "next";
import { recordMetadata } from "@/lib/record-metadata";

/** The tab names the record (record-title.ts), so tabs and history can be told apart. */
export async function generateMetadata({ params }: PageProps<"/deals/[id]">): Promise<Metadata> {
  return recordMetadata("deal", (await params).id);
}

export default async function DealPage({ params }: PageProps<"/deals/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const deal = await prisma.deal.findUnique({
    where: { id },
    include: { convertedProperty: { select: { id: true, address: true } } },
  });
  if (!deal) notFound();
  // Puts it on top of this person's Recent in search, once the response is out.
  after(() => recordView(user.id, "DEAL", deal.id));

  return (
    // A record: 1200 wide at most, with the details in a 320 rail from lg (section 5).
    <div className="max-w-300">
      <div className="mb-8 pointer-coarse:mb-6">
        <BackLink fallback="/deals" label="Deals" />
        <div className="mt-1">
          <DealAddress id={deal.id} value={deal.address} />
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
