import { firstName } from "@/lib/names";

/**
 * What a partner's email button asks the task page to have ready (`?do=`, docs/specs/emails-redesign.md, Q9). Pure;
 * see landing.test.ts. The page never acts on it: Approve and an assignment each take a tap.
 */

const ASKS = ["approve", "send-back", "assign"] as const;
export type Ask = (typeof ASKS)[number];
export const asked = (v: string | string[] | undefined): Ask | null => {
  const one = Array.isArray(v) ? v[0] : v;
  return ASKS.find((a) => a === one) ?? null;
};

/**
 * Who put the current assignee on the job and when, from the latest ASSIGNED line that gave it to them:
 * "Pieter assigned Zack Miller", `at` for the time after it. Without such a line (a job created with its assignee) it
 * reads "Zack Miller is assigned". Null when the assignee's name isn't known.
 */
export function assignedBy(
  live: { kind: string; data: unknown; actorLabel: string; createdAt: Date }[],
  task: { assigneeUserId: string | null; assigneeContactId: string | null },
  assigneeName: string | null,
): { text: string; at: string | null } | null {
  if (!assigneeName) return null;
  const gave = [...live].reverse().find((e) => {
    if (e.kind !== "ASSIGNED") return false;
    const to = ((e.data ?? {}) as { to?: { userId?: string | null; contactId?: string | null } }).to;
    return !!to && (task.assigneeContactId ? to.contactId === task.assigneeContactId : to.userId === task.assigneeUserId);
  });
  if (!gave) return { text: `${assigneeName} is assigned`, at: null };
  return { text: `${firstName(gave.actorLabel) || gave.actorLabel} assigned ${assigneeName}`, at: gave.createdAt.toISOString() };
}
