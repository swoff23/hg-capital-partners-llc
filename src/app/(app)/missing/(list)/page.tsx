import { requireUser } from "@/lib/auth";
import { todayYmdEastern } from "@/lib/dates";
import { PageHeader, EmptyState, TextLink } from "@/components/ui";
import { SpotArt } from "@/components/spot-art";
import { ofPriority, placesLine } from "@/lib/missing/checks";
import { handedOff, loadMissingInfo } from "@/lib/missing/queries";
import { MissingList } from "../missing-list";
import { ShowSwitch } from "../show-switch";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Missing info" };

export const dynamic = "force-dynamic";

/**
 * Missing info (docs/specs/missing-info.md, D1): every important blank, the
 * Required ones by default and the Suggested ones a switch away, grouped by
 * property and contractor. Home's Needs you row opens it. `?show=suggested`
 * keeps the pick.
 */
export default async function MissingPage({ searchParams }: PageProps<"/missing">) {
  await requireUser();
  const sp = await searchParams;
  const show = sp.show === "suggested" ? "suggested" : "required";
  const today = todayYmdEastern();
  const [info, handed] = await Promise.all([loadMissingInfo(today), handedOff()]);
  const required = ofPriority(info.gaps, "required");
  const suggested = ofPriority(info.gaps, "suggested");
  const gaps = show === "required" ? required : suggested;
  const skipped = info.skipped.filter((g) => g.priority === show);
  const places = placesLine(required);

  return (
    <div className="max-w-200">
      <PageHeader
        title="Missing info"
        subtitle={
          required.length > 0 ? `${required.length.toLocaleString("en-US")} to fill in${places ? ` · ${places}` : ""}` : "Everything required is filled in"
        }
      />
      <div>
        {gaps.length === 0 ? (
          <>
            <ShowSwitch show={show} required={required.length} suggested={suggested.length} />
            <EmptyState
              className="mt-6"
              action={
                show === "required" && suggested.length > 0 ? (
                  <TextLink href="/missing?show=suggested" className="text-body">
                    See the {suggested.length} suggested
                  </TextLink>
                ) : undefined
              }
            >
              <SpotArt name="all-clear" className="mx-auto mb-3 size-24 text-foreground max-sm:size-18" />
              <span className="block text-section text-foreground">Everything&apos;s filled in</span>
            </EmptyState>
          </>
        ) : (
          <MissingList
            gaps={gaps}
            skipped={skipped}
            handed={handed}
            variant="page"
            toolbar={<ShowSwitch show={show} required={required.length} suggested={suggested.length} />}
          />
        )}
        {gaps.length === 0 && skipped.length > 0 && <MissingList gaps={[]} skipped={skipped} handed={handed} variant="page" />}
      </div>
    </div>
  );
}
