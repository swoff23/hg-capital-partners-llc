import "server-only";
import { revalidatePath } from "next/cache";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { todayYmdEastern, type Ymd } from "@/lib/dates";
import { logError } from "@/lib/log";
import { changeUnit, ensureUnitIds, type Editor } from "@/lib/properties/service";
import { isPlaceholderUnitId, type UnitUtilities } from "@/lib/property-types";
import * as tasks from "@/lib/tasks/service";
import * as core from "@/lib/tasks/core";
import { MAKE_TASK_MAX, gapKey, itemsToSettle, taskFillOf, unitSubject } from "./checks";
import { loadMissingInfo } from "./queries";

/**
 * The only writer for Missing info (docs/specs/missing-info.md): Doesn't apply
 * and its Undo (D3), a utility status answered in place (D4), Mark vacant
 * (D6), and settling Make task's checklist items once their rows are filled
 * in (D9). Every other answer is an ordinary save on the record's own page.
 */

export class MissingInfoError extends Error {}

/** The partner making the change. */
type Staff = Pick<User, "id" | "name" | "email">;

const CHECK = /^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9]+)+$/;
const SUBJECT = /^(property|unit|lease|tenant|contact|term):[A-Za-z0-9_-]+(:[A-Za-z0-9_-]+)?$/;

/** Refuses a check or record key that isn't one the checks could have made. */
function assertKey(check: string, subject: string): void {
  if (!CHECK.test(check) || !SUBJECT.test(subject)) throw new MissingInfoError("That row isn't one we know. Reload to see the latest.");
}

/** Every page a gap can show on: Home's count, the worklist, and the record's own page. */
function revalidateGap(subject: string): void {
  revalidatePath("/");
  revalidatePath("/missing");
  const [kind, id] = subject.split(":");
  if (kind === "property" || kind === "unit") revalidatePath(`/properties/${id}`);
  if (kind === "lease" || kind === "term" || kind === "tenant") revalidatePath("/tenants", "layout");
  if (kind === "contact") revalidatePath(`/contractors/${id}`);
}

/**
 * A unit row's subject with a lasting unit id. A unit saved before ids
 * existed shows under a placeholder ("unit-at-2"); a skip or a task item
 * keyed on it would be lost at the property's next units save, so the
 * property's units get their ids first and the placeholder becomes the id of
 * the unit in its place.
 */
export async function lastingSubject(subject: string, p: tasks.Principal, by: Editor): Promise<string> {
  const [kind, propertyId, unitId] = subject.split(":");
  if (kind !== "unit" || !isPlaceholderUnitId(unitId)) return subject;
  const units = await ensureUnitIds(propertyId, p, by);
  const at = Number(unitId.slice("unit-at-".length));
  const id = units[at]?.id;
  if (!id) throw new MissingInfoError("That unit is gone. Reload to see the latest.");
  return unitSubject(propertyId, id);
}

/** The same for a row's whole key, `<check>|<subject>`. */
export async function lastingKey(key: string, p: tasks.Principal, by: Editor): Promise<string> {
  const at = key.indexOf("|");
  if (at < 0) throw new MissingInfoError("That row isn't one we know. Reload to see the latest.");
  const check = key.slice(0, at);
  const subject = key.slice(at + 1);
  assertKey(check, subject);
  return gapKey(check, await lastingSubject(subject, p, by));
}

/** Doesn't apply (D3): the gap leaves the list for its fold, with who and when. Returns the subject it was kept under. */
export async function skipGap(check: string, subject: string, user: Staff): Promise<string> {
  assertKey(check, subject);
  const lasting = await lastingSubject(subject, tasks.staffPrincipal(user), user);
  await prisma.missingInfoSkip.upsert({
    where: { check_subject: { check, subject: lasting } },
    create: { check, subject: lasting, createdByUserId: user.id },
    update: {},
  });
  revalidateGap(lasting);
  await settleMissingInfo();
  return lasting;
}

/** Undo, or "Needs it again" from the fold: the gap comes back. */
export async function unskipGap(check: string, subject: string): Promise<void> {
  assertKey(check, subject);
  await prisma.missingInfoSkip.deleteMany({ where: { check, subject } });
  revalidateGap(subject);
}

/** The status boxes a row answers in place. */
const STATUS_FIELDS = new Set<keyof UnitUtilities>(["nationalGridAutopay", "nationalFuelAutopay", "nationalFuelLofl", "waterAutopay"]);

/**
 * Done or NA on a utility status, from the worklist (D4). Returns what was
 * there before, for Undo.
 */
export async function answerUtility(
  propertyId: string,
  unitId: string,
  field: keyof UnitUtilities,
  value: string | null,
  user: Staff,
): Promise<string | null> {
  if (!STATUS_FIELDS.has(field)) throw new MissingInfoError("That box takes a typed answer. Open the unit to fill it in.");
  // The worklist sends Done or NA; its Undo sends back whatever the box held ("Call to confirm"), as the unit sheet keeps it.
  if (value !== null && (!value.trim() || value.length > 80)) throw new MissingInfoError("Pick Done or NA.");
  let before: string | null = null;
  await changeUnit(
    propertyId,
    unitId,
    (u) => {
      before = u.utilities?.[field] ?? null;
      return { ...u, utilities: { ...u.utilities, [field]: value } };
    },
    tasks.staffPrincipal(user),
    user,
  );
  revalidateGap(`unit:${propertyId}:${unitId}`);
  await settleMissingInfo();
  return before;
}

/** Mark vacant (D6), from today, or `null` to take it back. */
export async function setVacant(propertyId: string, unitId: string, vacant: boolean, user: Staff, today: Ymd = todayYmdEastern()): Promise<void> {
  await changeUnit(propertyId, unitId, (u) => ({ ...u, vacantSince: vacant ? today : null }), tasks.staffPrincipal(user), user);
  revalidateGap(`unit:${propertyId}:${unitId}`);
  await settleMissingInfo();
}

/**
 * Make task's checklist (D9): one item per row asked for that's still a gap,
 * each keyed to its row under a lasting unit id, in worklist order. Refused
 * when every row has been filled in since the list was opened.
 */
export async function makeTaskChecklist(keys: readonly string[], user: Staff, today: Ymd = todayYmdEastern()): Promise<{ title: string; checkKey: string }[]> {
  if (keys.length === 0) return [];
  if (keys.length > MAKE_TASK_MAX) throw new MissingInfoError(`A task can take up to ${MAKE_TASK_MAX} rows. Pick fewer.`);
  const p = tasks.staffPrincipal(user);
  const lasting: string[] = [];
  for (const k of keys) lasting.push(await lastingKey(k, p, user));
  const fill = taskFillOf((await loadMissingInfo(today)).gaps, lasting);
  if (!fill) throw new MissingInfoError("Those rows are filled in already. Reload Missing info to see what's left.");
  // The rows now show whose task they're in.
  revalidatePath("/missing");
  return fill.items.map((title, i) => ({ title, checkKey: fill.keys[i] }));
}

/** Who ticks a Make task item: the Activity line reads "Missing info checked …". */
const SETTLER = tasks.systemPrincipal("Missing info");

/**
 * Tick every open Make task item whose row is no longer a gap (filled in,
 * skipped, or its record gone), and finish a task once its last item ticks
 * (D9). An item unticked by hand while its row is filled ticks again here.
 * Runs after each Missing info write and from the every-minute job, so a
 * field filled anywhere in the app settles within a minute. Returns how many
 * items it ticked.
 */
export async function settleMissingInfo(today: Ymd = todayYmdEastern()): Promise<number> {
  const open = await prisma.taskChecklistItem.findMany({
    where: { checkKey: { not: null }, done: false, task: { status: { notIn: ["DONE", "CANCELED"] } } },
    select: { id: true, taskId: true, checkKey: true },
  });
  if (open.length === 0) return 0;
  const settled = itemsToSettle(open, (await loadMissingInfo(today)).gaps);
  if (settled.length === 0) return 0;

  const taskIds = new Set<string>();
  for (const item of settled) {
    try {
      await prisma.$transaction((tx) => core.setChecklistItem(tx, item.id, true, SETTLER));
      taskIds.add(item.taskId);
    } catch (err) {
      // Removed or its task deleted meanwhile: nothing to tick.
      if (!(err instanceof core.TaskRuleError)) throw err;
    }
  }
  for (const taskId of taskIds) {
    const left = await prisma.taskChecklistItem.count({ where: { taskId, done: false } });
    const task = await prisma.task.findUnique({ where: { id: taskId }, select: { status: true } });
    if (left > 0 || !task || task.status === "DONE" || task.status === "CANCELED") continue;
    try {
      await tasks.setTaskStatus(taskId, "DONE", SETTLER);
    } catch (err) {
      if (!(err instanceof core.TaskRuleError)) throw err;
      logError("missing-info:settle", err, { taskId }, { level: "warning" });
    }
  }
  revalidatePath("/tasks");
  revalidatePath("/");
  return settled.length;
}
