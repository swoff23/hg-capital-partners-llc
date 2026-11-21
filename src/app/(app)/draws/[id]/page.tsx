import { cache } from "react";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { fmtDay, todayYmdEastern } from "@/lib/dates";
import { drawAmount, lineFigures, openDraft, rehabFigures, unitGroups } from "@/lib/draws/figures";
import { getRehab, rehabPropertyOptions } from "@/lib/draws/queries";
import { recordMetadata } from "@/lib/record-metadata";
import { shortAddress } from "@/lib/normalize";
import { stageText } from "../format";
import { BudgetSection } from "./budget";
import { RehabDetails } from "./details";
import { DrawsSection, type DrawRow } from "./draws-section";
import { RehabView } from "./view";
import type { Metadata } from "next";

const load = cache(getRehab);

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  return recordMetadata("rehab", (await params).id);
}

/**
 * A rehab (docs/specs/rehab-draws.md, L2): loads it and hands the figures to RehabView (./view.tsx). The numbers are
 * worked out here on every read from the lines and draws (src/lib/draws/figures.ts); nothing is stored.
 */
export default async function RehabPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const [rehab, options] = await Promise.all([load(id), rehabPropertyOptions()]);
  if (!rehab) notFound();
  const today = todayYmdEastern();

  const lines = lineFigures(rehab.lines, rehab.draws);
  const fig = rehabFigures(rehab.holdback, lines, rehab.draws);
  const draft = openDraft(rehab.draws);

  // With the lender first (oldest first), then funded, newest first. `draws` arrives newest first.
  const sent = rehab.draws.filter((d) => d.stage !== "DRAFT");
  const rows: DrawRow[] = [
    ...sent.filter((d) => d.stage !== "FUNDED").reverse(),
    ...sent.filter((d) => d.stage === "FUNDED"),
  ].map((d) => ({
    draw: d,
    stage: stageText(d, today),
    amount: d.stage === "FUNDED" && d.fundedAmount != null ? d.fundedAmount : drawAmount(d),
  }));

  return (
    <RehabView
      rehabId={rehab.id}
      name={rehab.name}
      done={rehab.doneAt ? `Done ${fmtDay(todayYmdEastern(rehab.doneAt), { year: "auto", now: today })}` : null}
      edit={{ lender: rehab.lender ?? "", propertyIds: rehab.properties.map((p) => p.id), options: options.map((o) => ({ id: o.id, address: o.address })) }}
      fig={fig}
      details={
        <RehabDetails
          rehabId={rehab.id}
          name={rehab.name}
          lender={rehab.lender ?? ""}
          holdback={rehab.holdback != null ? String(rehab.holdback) : ""}
          properties={rehab.properties.map((p) => ({ id: p.id, label: shortAddress(p.address) || p.address }))}
          done={rehab.doneAt !== null}
        />
      }
      draws={<DrawsSection rows={rows} lines={rehab.lines} today={today} done={rehab.doneAt !== null} />}
    >
      <BudgetSection rehabId={rehab.id} units={rehab.units} groups={unitGroups(lines)} draws={rehab.draws} draft={draft ? { id: draft.id, number: draft.number } : null} ready={fig.ready} lender={rehab.lender} today={today} done={rehab.doneAt !== null} />
    </RehabView>
  );
}

export const dynamic = "force-dynamic";
