import { drawLine, type DrawIn } from "@/lib/draws/figures";
import type { Ymd } from "@/lib/dates";

type Current = Pick<DrawIn, "number" | "stage" | "stageChangedAt" | "waitingOnUs">;

/**
 * The current draw as a row reads it: "Draw 4 · Inspection · 6 days", or "Draw 5 · " and "Waiting on us" in the
 * warning color (L1). `none` is the words with no draw submitted.
 */
export function CurrentDraw({ draw, today, none = "Nothing submitted" }: { draw: Current | null; today: Ymd; none?: string }) {
  if (!draw) return <span className="text-muted-foreground">{none}</span>;
  if (draw.waitingOnUs) {
    return (
      <span>
        Draw {draw.number} · <span className="text-warn">Waiting on us</span>
      </span>
    );
  }
  return <span>{drawLine(draw, today)}</span>;
}
