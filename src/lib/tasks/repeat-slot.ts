import type { Prisma } from "@prisma/client";
import type { Ymd } from "@/lib/dates";
import { copyOrigin, repeatCreatedCopy } from "./repeat";

/**
 * The date the series gave a repeat copy when it was made, however it was
 * moved since (repeat.ts repeatFrom), from the data on the copy's own CREATED
 * line: its `due`, or, for a copy made before that line kept one and for
 * every copy Asana made and the importer joined, the `due` on the
 * REPEAT_CREATED line of the task that made it. Null for a series' first
 * task. Read-only: finishing a copy (core.ts createNextRepeat) and the task
 * page's repeat menu both ask it, so the two always step from the same date.
 * Takes a transaction or the plain client, and reads nothing for a task that
 * is no copy or whose line kept its date.
 */
export async function copySlot(db: Pick<Prisma.TransactionClient, "taskEvent">, taskId: string, created: unknown): Promise<Ymd | null> {
  const origin = copyOrigin(created);
  if (!origin) return null;
  if (origin.due) return origin.due;
  const made = await db.taskEvent.findFirst({
    where: { taskId: origin.repeatOf, kind: "REPEAT_CREATED", data: { path: ["next"], equals: taskId } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { data: true },
  });
  return repeatCreatedCopy(made?.data)?.due ?? null;
}
