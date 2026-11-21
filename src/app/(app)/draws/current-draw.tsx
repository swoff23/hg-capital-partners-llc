import { drawLine, type DrawIn } from "@/lib/draws/figures";
import type { Ymd } from "@/lib/dates";

type Current = Pick<DrawIn, "number" | "stage" | "stageChangedAt">;

/** The current draw as a row reads it: "Draw 4 · Inspection · 6 days" (L1). `none` is the words with no draw submitted. */
export function CurrentDraw({ draw, today, none = "Nothing submitted" }: { draw: Current | null; today: Ymd; none?: string }) {
  if (!draw) return <span className="text-muted-foreground">{none}</span>;
  return <span>{drawLine(draw, today)}</span>;
}
