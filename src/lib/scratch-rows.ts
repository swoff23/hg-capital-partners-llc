import type { Prisma, PrismaClient } from "@prisma/client";
import { Client } from "pg";

/**
 * The one key every database test locks while it runs: a session lock in the
 * one-key form, which the app's own two-key transaction locks (tasks/core.ts,
 * portal/reset.ts) never meet.
 */
const TURN_LOCK = 20261120;

/**
 * The rows one database test (`*.pg.test.ts`) makes in the scratch database,
 * and their removal when it finishes.
 *
 * A worktree's dev server reads the same database the tests write to
 * (hg_<worktree>_scratch, scripts/setup-worktree.mjs), so a row a test leaves
 * shows on Portfolio, on Tasks and in every picker. By Nov 20 one such database
 * held 17 made-up properties, 3,360 tasks on them and nine contractors with the
 * same name.
 *
 * A test makes its users, contractors, properties, deals and task templates
 * through here, which records each id. `remove` deletes those rows and what
 * hangs off them: their tasks (a task's events, emails, files and links go with
 * it), their security events, and by cascade their logins, reset links and
 * email rows. It touches nothing else, so a test can share its database with a
 * running app.
 *
 * Database tests also take turns on a database (`takeTurn`). `npm test` runs
 * every test file at once, and the app emails every partner with a sign-in
 * (tasks/core.ts notify), so one file's users are partners to every other file
 * while they exist: an extra email line in its counts, and once a file deletes
 * its users, a foreign key error in whichever file was writing them an email.
 *
 * `client` is a function because a test opens its client in `before`:
 *
 *   const made = scratchRows(() => prisma);
 *   before(async () => {
 *     if (skip) return;
 *     prisma = makeClient({ DATABASE_URL: URL_ENV });
 *     await made.takeTurn(URL_ENV);
 *   });
 *   after(async () => {
 *     if (skip) return;
 *     await made.remove();
 *     await prisma.$disconnect();
 *   });
 */
export function scratchRows(client: () => PrismaClient) {
  const userIds: string[] = [];
  const contactIds: string[] = [];
  const propertyIds: string[] = [];
  const dealIds: string[] = [];
  const templateIds: string[] = [];
  let turn: Client | null = null;

  async function removeRows(): Promise<void> {
    const prisma = client();
    // A test's tasks: on its property, made by or given to its user, or given to its contractor. A copy a repeat
    // makes and a task the app makes for a property (insurance renewal) have no maker, so the property finds them.
    const tasks = await prisma.task.findMany({
      where: {
        OR: [
          { propertyId: { in: propertyIds } },
          { createdByUserId: { in: userIds } },
          { assigneeUserId: { in: userIds } },
          { assigneeContactId: { in: contactIds } },
        ],
      },
      select: { id: true },
    });
    const taskIds = tasks.map((t) => t.id);
    // SecurityEvent holds plain ids with no foreign key, so nothing cascades to it.
    await prisma.securityEvent.deleteMany({
      where: { OR: [{ userId: { in: userIds } }, { contactId: { in: contactIds } }, { taskId: { in: taskIds } }] },
    });
    await prisma.task.deleteMany({ where: { id: { in: taskIds } } });
    // Deals before properties, properties before the users who last saved them.
    await prisma.deal.deleteMany({ where: { id: { in: dealIds } } });
    await prisma.property.deleteMany({ where: { id: { in: propertyIds } } });
    await prisma.contact.deleteMany({ where: { id: { in: contactIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.taskTemplate.deleteMany({ where: { id: { in: templateIds } } });
  }

  return {
    /**
     * Waits until no other database test is running on this database, then holds the turn until `remove`. The lock
     * sits on a connection of its own, so it lasts the whole file, and Postgres drops it if the run is killed.
     */
    async takeTurn(url: string): Promise<void> {
      const held = new Client({ connectionString: url });
      // A connection the server drops emits here; without a listener it would end the run.
      held.on("error", () => {});
      await held.connect();
      await held.query("SELECT pg_advisory_lock($1)", [TURN_LOCK]);
      turn = held;
    },
    async user(data: Prisma.UserCreateArgs["data"]) {
      const row = await client().user.create({ data });
      userIds.push(row.id);
      return row;
    },
    async contact(data: Prisma.ContactCreateArgs["data"]) {
      const row = await client().contact.create({ data });
      contactIds.push(row.id);
      return row;
    },
    async property(data: Prisma.PropertyCreateArgs["data"]) {
      const row = await client().property.create({ data });
      propertyIds.push(row.id);
      return row;
    },
    async deal(data: Prisma.DealCreateArgs["data"]) {
      const row = await client().deal.create({ data });
      dealIds.push(row.id);
      return row;
    },
    async taskTemplate(data: Prisma.TaskTemplateCreateArgs["data"]) {
      const row = await client().taskTemplate.create({ data });
      templateIds.push(row.id);
      return row;
    },
    /** Deletes every row made through here and what hangs off it, then ends this file's turn. Safe when nothing was made. */
    async remove(): Promise<void> {
      try {
        await removeRows();
      } finally {
        await turn?.end();
        turn = null;
      }
    },
  };
}
