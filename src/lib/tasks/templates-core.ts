import type { Prisma, PrismaClient } from "@prisma/client";
import { FieldError } from "@/lib/action-result";
import { fmtDay, todayYmdEastern, type Ymd } from "@/lib/dates";
import { shortAddress } from "@/lib/normalize";
import { unitLabels } from "@/lib/picker-options-shape";
import { liveRecord } from "@/lib/record-scope";
import { PHONE_INVALID } from "@/lib/contractors/contact-fields";
import { DATE_INVALID, MOVE_OUT_BEFORE_IN } from "@/lib/tenants/fields";
import * as leases from "@/lib/tenants/core";
import { readTaskHome } from "@/lib/tenants/living";
import * as core from "./core";
import { tenantUnit } from "./lockbox";
import { leaseWhere, playbookKind, type AppliedLease, type PlaybookLease } from "./template-items";

export type { PlaybookLease } from "./template-items";

/**
 * Apply a playbook (docs/asana-migration-plan.md D28): one property, the
 * reviewed list of tasks, all created through core.createTask in a single
 * transaction so it's all or nothing. Each task records the template it came
 * from. Token filling and due offsets happen in the review step
 * (template-items.ts); what arrives here is what staff saw and kept.
 *
 * A move-in playbook can also create the household's upcoming lease, and a
 * move-out one set the living household's Moves out (docs/specs/tenants.md
 * section 9). That write goes through the tenants rules (tenants/core.ts) in
 * the same transaction, so a refused lease creates no tasks, and a task that
 * fails takes the lease back with it.
 *
 * On the client it's handed, like tasks/core.ts, so a database test runs it:
 * templates.ts is the app's caller, and refreshes the pages after the commit.
 */

type Tx = Prisma.TransactionClient;

export interface PlaybookRow {
  title: string;
  notes?: string | null;
  assignee: core.Assignee;
  dueDate: Ymd | null;
  checklist?: string[];
}

export interface ApplyPlaybookInput {
  propertyId: string;
  /** The unit of the building every task is about (move-in and move-out playbooks, BPLAY-004); one of the building's own labels. */
  unitLabel?: string | null;
  rows: PlaybookRow[];
  lease?: PlaybookLease | null;
}

export type AppliedPlaybook = { count: number; propertyId: string; lease: AppliedLease | null; leaseId: string | null };

/** Rows to a transaction this long: a playbook is a few dozen tasks, each with its own event and access rows. */
const APPLY_TIMEOUT_MS = 60_000;

export async function applyPlaybookWith(
  db: PrismaClient,
  templateId: string,
  input: ApplyPlaybookInput,
  p: core.Principal,
  now: Date = new Date(),
): Promise<AppliedPlaybook> {
  if (p.kind !== "staff") throw new core.TaskRuleError("Only staff can apply a playbook.");
  const rows = input.rows.filter((r) => r.title.trim().length >= 2);
  if (rows.length === 0) throw new core.TaskRuleError("Keep at least one task.");

  const userIds = [...new Set(rows.flatMap((r) => (r.assignee && "userId" in r.assignee ? [r.assignee.userId] : [])))];
  const contactIds = [...new Set(rows.flatMap((r) => (r.assignee && "contactId" in r.assignee ? [r.assignee.contactId] : [])))];
  const [template, property, users, contacts] = await Promise.all([
    db.taskTemplate.findUnique({ where: { id: templateId }, select: { id: true, anchorLabel: true } }),
    db.property.findUnique({ where: { id: input.propertyId }, select: { id: true, address: true, units: true } }),
    db.user.findMany({ where: { id: { in: userIds } }, select: { id: true } }),
    db.contact.findMany({ where: { id: { in: contactIds }, active: true, ...liveRecord }, select: { id: true } }),
  ]);
  if (!template) throw new core.TaskRuleError("That playbook no longer exists.");
  if (!property) throw new core.TaskRuleError("Choose a property.");
  // A unit is one of the building's own, as written; a stale pick (renamed since) is refused, not saved.
  const unitLabel = input.unitLabel?.trim() || null;
  if (unitLabel && !unitLabels(property.units).includes(unitLabel)) {
    throw new core.TaskRuleError("Choose a unit from this building.");
  }
  // The box only shows on a playbook whose date moves someone in or out; one renamed since has none.
  const lease = input.lease ?? null;
  if (lease && playbookKind(template.anchorLabel) !== lease.kind) {
    throw new core.TaskRuleError("This playbook changed since you opened it. Reload the page.");
  }
  const liveUsers = new Set(users.map((u) => u.id));
  const liveContacts = new Set(contacts.map((c) => c.id));
  // Someone removed since the playbook was written: the task starts unassigned.
  const live = (a: core.Assignee): core.Assignee =>
    a && "userId" in a ? (liveUsers.has(a.userId) ? a : null) : a && "contactId" in a ? (liveContacts.has(a.contactId) ? a : null) : null;

  const home = { propertyId: property.id, address: property.address, unitLabel };
  const done = await db.$transaction(
    async (tx) => {
      // The lease first: its refusal stops Apply before any task is made, and rolls back with them anyway.
      const written = lease ? await writeLease(tx, lease, home, { id: p.userId }, now) : null;
      for (const r of rows) {
        const task = await core.createTask(
          tx,
          {
            title: r.title,
            description: r.notes ?? null,
            dueDate: r.dueDate,
            propertyId: property.id,
            unitLabel,
            assignee: live(r.assignee),
            taskTemplateId: template.id,
          },
          p,
        );
        for (const item of r.checklist ?? []) {
          if (item.trim()) await core.addChecklistItem(tx, task.id, item, p);
        }
      }
      return written;
    },
    { timeout: APPLY_TIMEOUT_MS },
  );

  return { count: rows.length, propertyId: property.id, lease: done?.applied ?? null, leaseId: done?.leaseId ?? null };
}

type Home = { propertyId: string; address: string; unitLabel: string | null };

/**
 * The lease write the ticked box asks for, through the tenants rules on
 * Apply's transaction.
 *
 * The property row is locked first, until Apply commits. The lease written
 * here stays unseen until then, a few seconds behind its tasks, so a second
 * Create (a retry after a dropped connection) would pass the overlap check
 * beside it, and give id-less units other ids. Under the lock it waits, then
 * sees the lease and is refused. A units save locks the row first too
 * (properties/units-write.ts). NO KEY UPDATE, not FOR UPDATE, so tasks can
 * still be added to the property meanwhile (as in tasks/core.ts setStatus).
 */
async function writeLease(tx: Tx, plan: PlaybookLease, home: Home, by: leases.By, now: Date): Promise<{ leaseId: string; applied: AppliedLease }> {
  await tx.$executeRaw`SELECT 1 FROM "Property" WHERE "id" = ${home.propertyId} FOR NO KEY UPDATE`;
  const today = todayYmdEastern(now);
  const where = leaseWhere(shortAddress(home.address) || home.address, home.unitLabel);

  if (plan.kind === "move-in") {
    // Every unit gets a lasting id first, so the unit picked by its label names the one the lease points at.
    const ensured = await leases.ensureUnitIds(tx, home.propertyId);
    const unit = ensured ? tenantUnit(ensured.units, home.unitLabel) : null;
    if (!unit) refuse("Pick a unit for the lease.");
    const name = plan.name.replace(/\s+/g, " ").trim();
    try {
      const { id } = await leases.createLeaseIn(
        tx,
        {
          propertyId: home.propertyId,
          unitId: unit.unitId,
          tenants: [{ new: { fullName: name, phone: plan.phone?.trim() || null } }],
          movesIn: plan.on,
          source: "PLAYBOOK",
        },
        by,
      );
      return { leaseId: id, applied: { kind: "move-in", name } };
    } catch (err) {
      throw err instanceof FieldError ? moveInRefusal(err, where) : err;
    }
  }

  const living = (await readTaskHome(tx, { propertyId: home.propertyId, unitLabel: home.unitLabel, entryPermittedAt: null }, now))?.living;
  if (!living) refuse(`Nobody lives at ${where} now.`);
  try {
    await leases.patchLeaseIn(tx, living.leaseId, { movesOut: plan.on });
  } catch (err) {
    throw err instanceof FieldError ? moveOutRefusal(err, living.movesIn, today) : err;
  }
  return { leaseId: living.leaseId, applied: { kind: "move-out", names: living.tenants.map((t) => t.name), movesOut: plan.on } };
}

/**
 * A refused lease write as the Apply page shows it: under the lease box (the
 * `lease` field), in plain words, about 30 characters so it fits beside the
 * way through on a 375 phone (UNTICK_LEASE_SHORT, which the page adds).
 */
function leaseRefusal(line: string): FieldError {
  return new FieldError({ lease: line });
}

function refuse(line: string): never {
  throw leaseRefusal(line);
}

/** The tenants rules' refusal of a new lease, said for the Apply page. */
function moveInRefusal(err: FieldError, where: string): FieldError {
  const [key, message] = Object.entries(err.fieldErrors)[0] ?? ["", err.message];
  if (key === "unitId" && message === leases.PICK_UNIT) return leaseRefusal("Pick a unit for the lease.");
  if (key === "unitId") return leaseRefusal("That unit is gone.");
  // A number that doesn't read, or one too long to be one.
  if (key === "tenants.0.phone") return leaseRefusal(message === PHONE_INVALID ? "Enter their full phone number." : "Shorten the phone number.");
  if (key === "tenants.0.fullName") return leaseRefusal("Shorten the tenant's name.");
  // Overlap is the one rule on Moves in once the date reads. "Then" is the move-in day the box names.
  if (key === "movesIn" && message !== DATE_INVALID) return leaseRefusal(`${where} has another lease then.`);
  return leaseRefusal(message);
}

/** The tenants rules' refusal of a Moves out, said for the Apply page. */
function moveOutRefusal(err: FieldError, movesIn: Ymd | null, today: Ymd): FieldError {
  const message = Object.values(err.fieldErrors)[0] ?? err.message;
  if (message === MOVE_OUT_BEFORE_IN && movesIn) return leaseRefusal(`They moved in ${fmtDay(movesIn, { year: "auto", now: today })}.`);
  if (message === MOVE_OUT_BEFORE_IN || message === DATE_INVALID) return leaseRefusal(message);
  // Otherwise the stay now runs into the next household's.
  return leaseRefusal("Next tenants move in before that.");
}
