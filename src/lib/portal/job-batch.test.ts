import test from "node:test";
import assert from "node:assert/strict";
import { TaskRuleError, type Principal, type Tx } from "@/lib/tasks/core";
import { BatchAlreadyPosted, allOwnPosted, postBatchIn } from "./job-batch";

/**
 * The batch step on a fake transaction: the same photos posted twice (two
 * tabs at once, or again after a lost answer) post once, and the other send
 * answers quietly instead of "Write something or add a photo." Core's own
 * addComment runs against the fake, so its lock, its link guard and its
 * refusal are the real ones.
 */

const ZACK: Principal = { kind: "contractor", contactId: "c-zack", label: "Zack Reading" };

type Call = { model: string; op: string; args: Record<string, unknown> };
type Row = { id: string; uploadedByContactId: string; eventId: string | null; asanaGid: string | null; kind: string };

/** A job with these attachment rows. `linkCount` is what addComment's link step finds still unposted. */
function fakeTx(rows: Row[], opts: { status?: string; linkCount?: (ids: string[]) => number; postedAfterLink?: boolean } = {}) {
  const calls: Call[] = [];
  let linked = false;
  const current = () => (opts.postedAfterLink && linked ? rows.map((r) => ({ ...r, eventId: r.eventId ?? "ev-other" })) : rows);
  const answer = (model: string, op: string, args: Record<string, unknown>): unknown => {
    const where = (args.where ?? {}) as Record<string, unknown>;
    const ids = ((where.id as { in?: string[] } | undefined)?.in ?? []) as string[];
    if (model === "task" && op === "findUnique") return { id: "t1", status: opts.status ?? "IN_PROGRESS", assigneeContactId: "c-zack", title: "Hang drywall" };
    if (model === "taskAccess" && op === "findUnique") return { revokedAt: null, contact: { active: true, portalAccount: { status: "ACTIVE" } } };
    if (model === "taskAttachment" && op === "findMany") {
      const mine = current().filter((r) => ids.includes(r.id));
      // ownUnposted asks for this contractor's unposted rows; allOwnPosted reads every row by id.
      if ("eventId" in where) return mine.filter((r) => r.eventId === null && r.uploadedByContactId === where.uploadedByContactId && r.asanaGid === null);
      return mine;
    }
    if (model === "taskAttachment" && op === "updateMany") {
      linked = true;
      return { count: opts.linkCount ? opts.linkCount(ids) : ids.length };
    }
    if (model === "taskEvent" && op === "create") return { id: "ev-new", ...(args.data as object) };
    if (op === "findUnique" || op === "findFirst") return null;
    if (op === "findMany") return [];
    if (op === "updateMany") return { count: 0 };
    return { id: `${model}-${calls.length}` };
  };
  const tx = new Proxy(
    {},
    {
      get(_, model: string) {
        if (model === "then") return undefined;
        if (model === "$executeRaw" || model === "$queryRaw") {
          return async (sql: TemplateStringsArray) => {
            calls.push({ model, op: sql.join("?"), args: {} });
            return model === "$executeRaw" ? 1 : [];
          };
        }
        return new Proxy(
          {},
          {
            get(__, op: string) {
              return async (args: Record<string, unknown> = {}) => {
                calls.push({ model, op, args });
                return answer(model, op, args);
              };
            },
          },
        );
      },
    },
  ) as unknown as Tx;
  return { tx, calls };
}

const writes = (calls: Call[]) => calls.filter((c) => /^(create|update|upsert|delete)/.test(c.op));
const photo = (id: string, over: Partial<Row> = {}): Row => ({ id, uploadedByContactId: "c-zack", eventId: null, asanaGid: null, kind: "IMAGE", ...over });

test("a batch posts as one update marked as a batch, and its event comes back for the Undo", async () => {
  const { tx, calls } = fakeTx([photo("a1"), photo("a2")]);
  const out = await postBatchIn(tx, "t1", ZACK, ["a1", "a2"]);
  assert.equal(out.alreadyPosted, false);
  assert.equal(out.event?.id, "ev-new");
  const event = calls.find((c) => c.model === "taskEvent" && c.op === "create")!;
  assert.deepEqual((event.args.data as { data: unknown }).data, { batch: true });
});

test("the same photos sent again after they posted answer quietly, and write nothing", async () => {
  const { tx, calls } = fakeTx([photo("a1", { eventId: "ev-first" }), photo("a2", { eventId: "ev-first" })]);
  const out = await postBatchIn(tx, "t1", ZACK, ["a1", "a2"]);
  assert.deepEqual(out, { event: null, alreadyPosted: true });
  assert.deepEqual(writes(calls), [], "no empty update, no email");
});

test("the losing side of two sends at once is told nothing wrong: its update rolls back and the page stays quiet", async () => {
  // Both sends read the photos as unposted. This one waited on the task row; by then the other had linked them, so
  // its link step finds none, and core refuses an update with no words and no photos.
  const { tx } = fakeTx([photo("a1"), photo("a2")], { linkCount: () => 0, postedAfterLink: true });
  await assert.rejects(postBatchIn(tx, "t1", ZACK, ["a1", "a2"]), (err: unknown) => err instanceof BatchAlreadyPosted);
  // Thrown, so Prisma rolls the transaction back; it isn't a TaskRuleError, so nothing shows it as a refusal.
  assert.equal(new BatchAlreadyPosted() instanceof TaskRuleError, false);
});

test("someone else's photos, or ones never recorded, are still refused in core's words", async () => {
  const { tx } = fakeTx([photo("a1", { uploadedByContactId: "c-mike" })]);
  await assert.rejects(postBatchIn(tx, "t1", ZACK, ["a1"]), /^TaskRuleError: Write something or add a photo\.$/);
  const imported = fakeTx([photo("a1", { eventId: "ev-asana", asanaGid: "123" })]);
  await assert.rejects(postBatchIn(imported.tx, "t1", ZACK, ["a1"]), /Write something or add a photo/);
});

test("a job approved since the photos went up takes no update: no event, not quiet, nothing written", async () => {
  const { tx, calls } = fakeTx([photo("a1")], { status: "DONE" });
  assert.deepEqual(await postBatchIn(tx, "t1", ZACK, ["a1"]), { event: null, alreadyPosted: false });
  assert.deepEqual(writes(calls), []);
});

test("allOwnPosted: every row this contractor's and posted; a row removed from the job counts as posted", async () => {
  const posted = photo("a1", { eventId: "ev1" });
  assert.equal(await allOwnPosted(fakeTx([posted]).tx, "t1", "c-zack", ["a1", "a1"]), true);
  assert.equal(await allOwnPosted(fakeTx([posted, photo("a2")]).tx, "t1", "c-zack", ["a1", "a2"]), false, "one still unposted");
  assert.equal(await allOwnPosted(fakeTx([photo("a1", { eventId: "ev1", uploadedByContactId: "c-mike" })]).tx, "t1", "c-zack", ["a1"]), false);
  assert.equal(await allOwnPosted(fakeTx([]).tx, "t1", "c-zack", ["gone"]), true, "staff removed it");
  assert.equal(await allOwnPosted(fakeTx([]).tx, "t1", "c-zack", []), false, "nothing named is nothing posted");
});
