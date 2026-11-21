import Link from "next/link";
import { Meter } from "@/components/meter";
import { Money } from "@/components/money";
import { Section, buttonClass } from "@/components/ui";
import { fmtMoney } from "@/lib/utils";
import { todayYmdEastern } from "@/lib/dates";
import { currentDraw, lineFigures, rehabFigures } from "@/lib/draws/figures";
import { rehabForProperty, rehabPropertyOptions } from "@/lib/draws/queries";
import { CurrentDraw } from "../../draws/current-draw";
import { NewRehabButton } from "../../draws/new-rehab";

/**
 * The property's Rehab section (docs/specs/rehab-draws.md, L3), right after Tasks: the current draw with its stage
 * and days, a Meter for funded of the holdback, ready and left, and Open rehab. A Rehabbing property with no open
 * rehab shows Add rehab instead, with the property picked. Anything else, and a rehab marked done, shows nothing.
 */
export async function PropertyRehabSection({ propertyId, status }: { propertyId: string; status: string | null }) {
  const rehab = await rehabForProperty(propertyId);
  if (!rehab) {
    if (!/^rehab/i.test(status ?? "")) return null;
    const options = (await rehabPropertyOptions()).map((o) => ({ id: o.id, address: o.address }));
    return (
      <Section title="Rehab" actions={<NewRehabButton options={options} preselect={[propertyId]} variant="secondary" size="sm" icon={false}>Add rehab</NewRehabButton>}>
        <p className="text-meta text-muted-foreground">No rehab yet.</p>
      </Section>
    );
  }

  const fig = rehabFigures(rehab.holdback, lineFigures(rehab.lines, rehab.draws), rehab.draws);
  const current = currentDraw(rehab.draws);
  const href = `/draws/${rehab.id}`;
  return (
    <Section
      title="Rehab"
      actions={
        <Link href={href} className={buttonClass({ variant: "secondary", size: "sm" })}>
          Open rehab
        </Link>
      }
    >
      <div className="space-y-2">
        <p className="text-body text-foreground">
          <CurrentDraw draw={current} today={todayYmdEastern()} none="Nothing submitted" />
        </p>
        <Meter
          value={fig.funded}
          max={fig.holdback}
          label="Funded"
          valueText={`${fmtMoney(fig.funded)} funded of ${fmtMoney(fig.holdback)}`}
        />
        <p className="text-meta text-muted-foreground">
          Ready <Money value={fig.ready} /> · Left <Money value={fig.left} /> of <Money value={fig.holdback} />
        </p>
      </div>
    </Section>
  );
}
