import { cache } from "react";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { ArchivedNotice } from "@/components/record-archive";
import { RailList } from "@/components/rail";
import { Section, TextLink } from "@/components/ui";
import { isActionRender } from "@/lib/action-render";
import { archivedLine } from "@/lib/archive";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { shortAddress } from "@/lib/normalize";
import { preload } from "@/lib/preload";
import { recordView } from "@/lib/recent-views";
import { setDealArchived } from "../actions";
import { DealActivity, dealNotes } from "./deal-activity";
import { DealFact, DealListingLink, DealPassReason, DealPrice, DealStageRow, DealUnits } from "./deal-detail";
import { DealSheet } from "./deal-sheet";

/**
 * The deal as its sheet reads it: the row, the property it became and who
 * archived it. Once per request (React cache), so the route's metadata, its
 * not-found check and the sheet share one read.
 */
export const loadDeal = cache((id: string) =>
  prisma.deal.findUnique({
    where: { id },
    include: {
      convertedProperty: { select: { id: true, address: true } },
      archivedByUser: { select: { name: true, email: true } },
    },
  }),
);

type LoadedDeal = NonNullable<Awaited<ReturnType<typeof loadDeal>>>;

/** The facts, each changed where it stands: the stage, the two prices, the units, what's next and the listing, with the pass reason at Pass. */
function DealFacts({ deal }: { deal: LoadedDeal }) {
  return (
    <RailList>
      <DealStageRow id={deal.id} status={deal.status} />
      <DealPrice id={deal.id} which="their" raw={deal.theirPriceRaw} />
      <DealPrice id={deal.id} which="our" raw={deal.ourPriceRaw} />
      <DealUnits id={deal.id} value={deal.units} />
      <DealFact id={deal.id} field="nextAction" label="Next action" kind="text" value={deal.nextAction} empty="Add next action" />
      <DealListingLink id={deal.id} value={deal.sourceUrl} />
      {deal.status === "Pass" && <DealPassReason id={deal.id} value={deal.passReason} />}
    </RailList>
  );
}

/**
 * A deal's sheet, loaded on the server for both ways in: the intercepting
 * route over whatever page it was opened from, and deals/[id]/page.tsx over
 * the list on a full load (`closeHref`). Details (the property it became,
 * the archived line, the facts) beside Activity.
 */
export async function DealRecordSheet({ id, closeHref }: { id: string; closeHref?: string }) {
  // Activity's notes start now, beside the deal; the session check runs with them and is awaited before anything shows.
  preload(dealNotes(id));
  const [user, deal] = await Promise.all([requireUser(), loadDeal(id)]);
  if (!deal) notFound();
  // Puts it on top of this person's Recent in search, once the response is out (not again for an edit's refresh).
  if (!(await isActionRender())) after(() => recordView(user.id, "DEAL", deal.id));

  return (
    <DealSheet
      // A new sheet per deal, so a field left open on one never shows on the next.
      key={deal.id}
      id={deal.id}
      address={deal.address}
      archived={!!deal.archivedAt}
      closeHref={closeHref}
      details={
        // Headed like Activity beside it, so the two columns start on one line.
        <Section title="Details">
          {deal.convertedProperty && (
            <p className="mb-3 text-meta text-muted-foreground">
              Converted to{" "}
              <TextLink href={`/properties/${deal.convertedProperty.id}`}>{shortAddress(deal.convertedProperty.address) || deal.convertedProperty.address}</TextLink>
            </p>
          )}
          {deal.archivedAt && (
            <ArchivedNotice
              className="mb-3"
              kind="deal"
              id={deal.id}
              line={archivedLine(deal.archivedByUser, deal.archivedAt)}
              action={setDealArchived}
            />
          )}
          <DealFacts deal={deal} />
        </Section>
      }
    >
      <DealActivity dealId={deal.id} />
    </DealSheet>
  );
}
