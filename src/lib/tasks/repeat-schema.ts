import { z } from "zod";
import { REPEAT_FREQS, REPEAT_LIMITS, type RepeatRule } from "./repeat";

/**
 * The repeat rule a form post is checked against (the New task and task page
 * actions). Server code only: zod is large, so the browser takes ./repeat,
 * whose parseRepeatRule gives the same answers by hand (repeat.test.ts runs
 * both over the same inputs).
 */
export const repeatRuleSchema = z.object({
  freq: z.enum(REPEAT_FREQS),
  interval: z.number().int().min(REPEAT_LIMITS.interval.min).max(REPEAT_LIMITS.interval.max).default(1),
  dayOfMonth: z.number().int().min(REPEAT_LIMITS.dayOfMonth.min).max(REPEAT_LIMITS.dayOfMonth.max).optional(),
  weekday: z.number().int().min(REPEAT_LIMITS.weekday.min).max(REPEAT_LIMITS.weekday.max).optional(),
}) satisfies z.ZodType<RepeatRule>;
