import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { todayYmdEastern, toYmd } from "@/lib/dates";
import { makeClient } from "@/lib/db-client";
import { RateLimiter } from "@/lib/rate-limit";
import { scratchRows } from "@/lib/scratch-rows";
import { listedTask } from "@/lib/task-scope";
import * as core from "@/lib/tasks/core";
import { MAX_WAITING_DRAFTS, draftAutoKey, draftBatchPrefix } from "@/lib/tasks/drafts";
import { homeOccupied } from "@/lib/tenants/living";
import { disconnect, verifyAccessTokenValue } from "./connections-core";
import { livingTenants, type Directory } from "./directory";
import { unauthorizedEndpoint } from "./endpoints-core";
import { SERVER_INSTRUCTIONS } from "./instructions";
import { bearerToken, connectorConfigFor, wwwAuthenticateValue } from "./oauth-core";
import { signInClaude } from "./sign-in-fixture";
import {
  CALLS_PER_MINUTE,
  HOUR_MS,
  MINUTE_MS,
  SAVES_PER_HOUR,
  handleMcp,
  loadSaveFacts,
  type McpDeps,
  type SaveDrafts,
  type SaveDraftsRefused,
  type SaveDraftsReplayed,
  type SaveDraftsSaved,
} from "./tools";

/**
 * The connector on a real Postgres through the app's driver
 * (docs/specs/tasks-from-claude.md, section 13 step 3): a partner's Claude
 * signs in through the sign-in library, then initialize, tools/list,
 * get_directory and save_drafts, each as its own request to the function
 * /api/mcp/<key> serves (tools.ts handleMcp) at that partner's own address.
 * Then a save sent twice, a used key, a save with one bad draft, who a save
 * accepts, text the database can't store, a save sent again after its records
 * changed, a save that fails after its checks, the cap on waiting drafts, and
 * a token whose connection was ended.
 *
 * The route file itself loads Next, which node:test can't, so its bindings
 * are made here from the same pieces: the bearer check is
 * connections-core.ts verifyAccessTokenValue (what oauth.ts verifyAccessToken
 * calls), and the save is tasks/core.ts saveDrafts in one transaction, the way
 * tasks/service.ts saveDrafts runs it (tools.test.ts pins that line of
 * service.ts, this file's own, and the route's).
 *
 * Opt-in like oauth.pg.test.ts, by the same guard: `npm test` skips it unless
 * HG_SCRATCH_DATABASE_URL names a local scratch database (its name must
 * contain "scratch"). It writes rows there and deletes them when it finishes
 * (scratch-rows.ts), the trade, leases and tenants in its own teardown.
 *
 *   HG_SCRATCH_DATABASE_URL=postgresql://<you>@localhost:5432/<name>_scratch npx tsx --test src/lib/claude/tools.pg.test.ts
 */

const URL_ENV = process.env.HG_SCRATCH_DATABASE_URL ?? "";

/** A database on this machine whose name says scratch, parsed whole (job-batch.pg.test.ts's rule). */
function isLocalScratch(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  return (
    url.protocol === "postgresql:" &&
    url.username !== "" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
    (url.port === "" || url.port === "5432") &&
    /^\/[a-z0-9_]*scratch[a-z0-9_]*$/.test(url.pathname) &&
    url.search === "" &&
    url.hash === ""
  );
}
const skip = isLocalScratch(URL_ENV) ? false : "set HG_SCRATCH_DATABASE_URL to a local scratch database to run this";
const timeout = 60_000;

const APP_URL = "https://app.example.test";
const SECRET = "scratch-secret-scratch-secret-scratch!!";
const cfg = connectorConfigFor(APP_URL, SECRET);

/** A partner's Claude once it has signed in: its access token, and the partner's own address and the key in it. */
interface Claude {
  token: string;
  address: string;
  key: string;
}

let prisma: PrismaClient;
/** What this run makes, deleted when it finishes so the scratch database stays as it was (scratch-rows.ts). */
const made = scratchRows(() => prisma);
/** Letters only, so it is one word in an address and never a house number. */
let run: string;
let pieter: { id: string; name: string | null; email: string };
let connor: { id: string; name: string | null; email: string };
let pieterClaude: Claude;
let connorClaude: Claude;
let zackId: string;
let robId: string;
let annId: string;
let goneId: string;
/** Signed up through the shared link with a trade, and no partner has kept them. */
let newId: string;
/** Active, with no trade and no job: the assignee picker doesn't offer them either. */
let unlistedId: string;
let inactiveId: string;
/** Two units: 1 is vacant and carries a lockbox code, 2 has tenants. */
let duplexId: string;
/** No units: one home, lived in. */
let houseId: string;
let archivedPropertyId: string;
let lockbox: string;
let tradeId: string;

const logged: { scope: string; err: unknown }[] = [];

const staff = (user: { id: string; name: string | null; email: string }): core.Principal => ({ kind: "staff", userId: user.id, label: user.name ?? user.email });

/** The task service's saveDrafts (tasks/service.ts), without its revalidatePath: core's rule in one transaction. */
const save: SaveDrafts = (user, batchKey, drafts, check) =>
  prisma.$transaction((tx) => core.saveDrafts(tx, batchKey, drafts, staff(user), check), { timeout: 20_000, maxWait: 10_000 });

/** What the route binds for a call to one partner's address (src/app/api/mcp/[key]/route.ts depsFor). */
function depsWith(key: string, over: Partial<McpDeps> = {}): McpDeps {
  return {
    verify: (request, now) => verifyAccessTokenValue(prisma, cfg, bearerToken(request.headers), key, now),
    unauthorized: (request) => unauthorizedEndpoint(cfg, key, request.headers),
    db: prisma,
    save,
    appUrl: () => APP_URL,
    limits: { calls: new RateLimiter(CALLS_PER_MINUTE, MINUTE_MS), saves: new RateLimiter(SAVES_PER_HOUR, HOUR_MS) },
    now: () => new Date(),
    logError: (scope, err) => logged.push({ scope, err }),
    ...over,
  };
}

/** The whole sign-in, as Claude and the partner's browser run it (sign-in-fixture.ts). The address was copied two minutes ago, so the access token, good for an hour, is live now. */
async function connect(user: { id: string }): Promise<Claude> {
  const signedIn = await signInClaude(prisma, cfg, user, new Date(Date.now() - 120_000));
  return { token: signedIn.tokens.access_token, address: signedIn.address, key: signedIn.key };
}

before(async () => {
  if (skip) return;
  prisma = makeClient({ DATABASE_URL: URL_ENV });
  await made.takeTurn(URL_ENV);
  run = `m${(randomUUID() + randomUUID()).replace(/[^a-f]/g, "").slice(0, 10)}x`;
  lockbox = `LOCK${run}`;
  pieter = await made.user({ email: `pieter-${run}@example.test`, name: `Pieter ${run}`, passwordHash: "scrypt$x" });
  connor = await made.user({ email: `connor-${run}@example.test`, name: `Connor ${run}`, passwordHash: "scrypt$x" });
  pieterClaude = await connect(pieter);
  connorClaude = await connect(connor);

  const trade = await prisma.trade.create({ data: { name: `Carpentry ${run}`, key: `carpentry ${run}` } });
  tradeId = trade.id;
  const contractor = (fullName: string, over: { phone?: string; email?: string; archivedAt?: Date } = {}) =>
    made.contact({ fullName, ...over, comments: `COMMENTS-${run}`, billingInfo: `BILLING-${run}`, tradeLinks: { create: [{ tradeId: trade.id }] } });
  // First names nobody else in the scratch database goes by, so a line can name each by it (drafts.ts nameAmong).
  // Zack gets job emails: a login, a first sign-in, the switch on.
  const zack = await contractor(`Zack${run} Reading`, { phone: "716-555-0100", email: `zack-${run}@example.test` });
  await prisma.portalAccount.create({ data: { contactId: zack.id, email: `zack-${run}@example.test`, passwordHash: "scrypt$x", mustChangePassword: false, status: "ACTIVE", lastSignInAt: new Date() } });
  zackId = zack.id;
  // Rob has a login and never signed in.
  const rob = await contractor(`Rob${run} Mason`);
  await prisma.portalAccount.create({ data: { contactId: rob.id, email: `rob-${run}@example.test`, passwordHash: "scrypt$x", status: "ACTIVE" } });
  robId = rob.id;
  annId = (await contractor(`Ann ${run}`)).id;
  goneId = (await contractor(`Gone ${run}`, { archivedAt: new Date() })).id;
  // The shared sign-up link's person: active, a trade picked on step 3, a login that has signed in, and not kept yet.
  const stranger = await made.contact({ fullName: `Zack${run} Reading`, phone: "716-555-0199 (new cell, use this one)", email: `stranger-${run}@example.test`, signupSource: "LINK", needsReview: true, tradeLinks: { create: [{ tradeId: trade.id }] } });
  await prisma.portalAccount.create({ data: { contactId: stranger.id, email: `stranger-${run}@example.test`, passwordHash: "scrypt$x", mustChangePassword: false, status: "ACTIVE", lastSignInAt: new Date() } });
  newId = stranger.id;
  unlistedId = (await made.contact({ fullName: `Nobody Listed ${run}` })).id;
  inactiveId = (await made.contact({ fullName: `Ivy Inactive ${run}`, active: false, tradeLinks: { create: [{ tradeId: trade.id }] } })).id;

  const duplex = await made.property({
    address: `933 ${run} Ave, Buffalo, NY 14209`,
    units: [
      { id: `${run}-u1`, label: "1", lockboxCode: lockbox, lockboxLocation: `GATE-${run}` },
      { id: `${run}-u2`, label: "2", lockboxCode: lockbox },
      { label: "HSE (house)" },
    ],
    notes: `NOTES-${run}`,
    loanNumber: `LOAN-${run}`,
    // With cents, so the amount can't turn up inside an id by chance.
    currentLoan: "410123.45",
  });
  duplexId = duplex.id;
  await prisma.lease.create({
    data: {
      propertyId: duplexId,
      unitId: `${run}-u2`,
      unitLabel: "2",
      movesIn: new Date("2026-01-01T00:00:00Z"),
      deposit: "1543.21",
      notes: `LEASENOTES-${run}`,
      tenants: { create: [{ primary: true, position: 0, tenant: { create: { fullName: `Dana ${run}`, phone: "716-555-0199" } } }] },
    },
  });
  houseId = (await made.property({ address: `56 ${run} St, Buffalo, NY 14209` })).id;
  await prisma.lease.create({ data: { propertyId: houseId, unitId: null, tenants: { create: [{ primary: true, position: 0, tenant: { create: { fullName: `Ana ${run}` } } }] } } });
  archivedPropertyId = (await made.property({ address: `7 ${run} Rd, Buffalo, NY 14201`, archivedAt: new Date() })).id;
});

after(async () => {
  if (skip) return;
  try {
    // scratchRows cannot remove these: a lease holds its property (Restrict), a tenant its leases, and a trade
    // outlives the contacts linked to it. Leases first, then the tenants only they named, then the trade.
    const leases = await prisma.lease.findMany({ where: { propertyId: { in: [duplexId, houseId, archivedPropertyId].filter(Boolean) } }, select: { id: true, tenants: { select: { tenantId: true } } } });
    await prisma.lease.deleteMany({ where: { id: { in: leases.map((l) => l.id) } } });
    await prisma.tenant.deleteMany({ where: { id: { in: leases.flatMap((l) => l.tenants.map((t) => t.tenantId)) } } });
    await made.remove();
    if (tradeId) await prisma.trade.deleteMany({ where: { id: tradeId } });
  } finally {
    await prisma.$disconnect();
  }
});

// ---------------------------------------------------------------------------
// Claude's side of a call
// ---------------------------------------------------------------------------

type RpcBody = { jsonrpc: string; id: unknown; result?: Record<string, unknown>; error?: { code: number; message: string } };

/** One POST to a partner's address, with `token` as the bearer (the partner's Claude's own unless another is given). */
function post(body: unknown, claude: Claude, deps: McpDeps, headers: Record<string, string> = {}, token: string | null = claude.token): Promise<Response> {
  return handleMcp(
    new Request(claude.address, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
      body: JSON.stringify(body),
    }),
    deps,
  );
}

const rpc = (id: number, method: string, params?: Record<string, unknown>) => ({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) });

async function callTool<T>(deps: McpDeps, claude: Claude, name: string, args: unknown): Promise<{ isError: boolean; body: T; text: string }> {
  const res = await post(rpc(3, "tools/call", { name, arguments: args }), claude, deps, { "mcp-protocol-version": "2025-11-25" });
  assert.equal(res.status, 200);
  const { result } = (await res.json()) as RpcBody;
  assert.ok(result);
  const [content] = result.content as { type: string; text: string }[];
  return { isError: result.isError as boolean, body: JSON.parse(content.text) as T, text: content.text };
}

const batchRows = (userId: string, batchKey: string) => prisma.task.findMany({ where: { autoKey: { startsWith: draftBatchPrefix(userId, batchKey) } }, orderBy: { autoKey: "asc" } });

const nextWeek = () => toYmd(new Date(Date.now() + 7 * 24 * HOUR_MS))!;

// ---------------------------------------------------------------------------
// The round trip
// ---------------------------------------------------------------------------

test("a partner's Claude signs in, reads the directory and saves drafts, each call on its own", { skip, timeout }, async () => {
  const deps = depsWith(pieterClaude.key);

  // No token: the 401 that sends Claude to sign-in. A made-up token: the same, marked invalid. The other partner's
  // token at this address: the same again, since a token works at its own partner's address and nowhere else.
  const none = await post(rpc(1, "initialize", { protocolVersion: "2025-11-25" }), pieterClaude, deps, {}, null);
  assert.equal(none.status, 401);
  assert.equal(none.headers.get("www-authenticate"), wwwAuthenticateValue(cfg, pieterClaude.key));
  const made = await post(rpc(1, "tools/list"), pieterClaude, deps, {}, randomBytes(32).toString("base64url"));
  assert.equal(made.status, 401);
  assert.match(made.headers.get("www-authenticate") ?? "", /error="invalid_token"/);
  assert.equal((await post(rpc(1, "tools/list"), pieterClaude, deps, {}, connorClaude.token)).status, 401);

  // initialize, then the notification that ends the handshake.
  const init = await post(rpc(1, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "claude-ai", version: "1.0.0" } }), pieterClaude, deps);
  assert.equal(init.status, 200);
  assert.deepEqual(((await init.json()) as RpcBody).result, {
    protocolVersion: "2025-11-25",
    capabilities: { tools: { listChanged: false } },
    serverInfo: { name: "HG Capital", title: "HG Capital", version: "1.0.0" },
    instructions: SERVER_INSTRUCTIONS,
  });
  assert.equal((await post({ jsonrpc: "2.0", method: "notifications/initialized" }, pieterClaude, deps, { "mcp-protocol-version": "2025-11-25" })).status, 202);

  // tools/list
  const list = ((await (await post(rpc(2, "tools/list"), pieterClaude, deps, { "mcp-protocol-version": "2025-11-25" })).json()) as RpcBody).result as { tools: { name: string; annotations: { readOnlyHint: boolean } }[] };
  assert.deepEqual(list.tools.map((t) => [t.name, t.annotations.readOnlyHint]), [["get_directory", true], ["save_drafts", false]]);

  // get_directory
  const directory = await callTool<Directory>(deps, pieterClaude, "get_directory", {});
  assert.equal(directory.isError, false);
  assert.equal(directory.body.today.date, todayYmdEastern());
  assert.deepEqual(directory.body.you, { id: `u:${pieter.id}`, name: `Pieter ${run}` });
  assert.deepEqual(directory.body.properties.find((p) => p.id === duplexId), {
    id: duplexId,
    address: `933 ${run} Ave, Buffalo, NY 14209`,
    units: [{ label: "1", hasTenants: false, tenants: [] }, { label: "2", hasTenants: true, tenants: [`Dana ${run}`] }],
  });
  assert.deepEqual(directory.body.properties.find((p) => p.id === houseId), { id: houseId, address: `56 ${run} St, Buffalo, NY 14209`, units: [], hasTenants: true, tenants: [`Ana ${run}`] });
  assert.equal(directory.body.properties.find((p) => p.id === archivedPropertyId), undefined);
  assert.deepEqual(directory.body.people.contractors.find((c) => c.id === `c:${zackId}`), {
    id: `c:${zackId}`,
    name: `Zack${run} Reading`,
    trades: [`Carpentry ${run}`],
    phone: "716-555-0100",
    email: `zack-${run}@example.test`,
    getsJobEmails: true,
  });
  assert.equal(directory.body.people.contractors.find((c) => c.id === `c:${robId}`)?.getsJobEmails, false);
  assert.equal(directory.body.people.contractors.find((c) => c.id === `c:${goneId}`), undefined);
  // The stranger from the shared sign-up link has the same name as Zack, a trade and a working login, and isn't here:
  // one Zack, with the partners' own record of his phone.
  for (const id of [newId, unlistedId, inactiveId]) assert.equal(directory.body.people.contractors.find((c) => c.id === `c:${id}`), undefined);
  assert.equal(directory.body.people.contractors.filter((c) => c.name === `Zack${run} Reading`).length, 1);
  assert.ok(!directory.text.includes("use this one"));
  assert.ok(directory.body.people.partners.some((u) => u.id === `u:${connor.id}`));
  // Nothing of this run's lockbox, loan, notes, deposit, comments or billing left the database.
  for (const secret of [lockbox, `GATE-${run}`, `LOAN-${run}`, `NOTES-${run}`, `LEASENOTES-${run}`, `COMMENTS-${run}`, `BILLING-${run}`, "410123.45", "1543.21", "716-555-0199"]) {
    assert.ok(!directory.text.includes(secret), `${secret} is in the directory`);
  }

  // save_drafts
  const batchKey = randomUUID();
  const due = nextWeek();
  const saved = await callTool<SaveDraftsSaved>(deps, pieterClaude, "save_drafts", {
    batchKey,
    drafts: [
      { title: `Unit 2 repairs ${run}`, notes: "Faucet drips. Closet door is off its track.", propertyId: duplexId, unitLabel: "2", assignee: `c:${zackId}`, due, entryPermitted: true, checklist: ["Fix the faucet", "Rehang the closet door"], heard: { property: "Lafayette", person: "Zach" } },
      { title: `Look at the furnace ${run}`, propertyId: houseId, assignee: `c:${robId}`, entryPermitted: false },
      { title: `Call the insurance agent ${run}` },
    ],
  });
  assert.equal(saved.isError, false);
  const rows = await batchRows(pieter.id, batchKey);
  assert.equal(rows.length, 3);
  assert.equal(saved.body.saved, 3);
  assert.equal(saved.body.alreadySaved, false);
  assert.equal(saved.body.tasksLink, `${APP_URL}/tasks`);
  const dueWords = new Date(`${due}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", ...(due.slice(0, 4) === todayYmdEastern().slice(0, 4) ? {} : { year: "numeric" }) });
  assert.deepEqual(saved.body.drafts, [
    { id: rows[0].id, link: `${APP_URL}/tasks/${rows[0].id}`, title: `Unit 2 repairs ${run}`, summary: `Zack${run} Reading · ${dueWords} · 933 ${run} Ave · Unit 2`, onAdd: `Emails Zack${run}` },
    { id: rows[1].id, link: `${APP_URL}/tasks/${rows[1].id}`, title: `Look at the furnace ${run}`, summary: `Rob${run} Mason · No date · 56 ${run} St`, onAdd: `Rob${run} doesn't get job emails` },
    { id: rows[2].id, link: `${APP_URL}/tasks/${rows[2].id}`, title: `Call the insurance agent ${run}`, summary: `Pieter ${run} · No date`, onAdd: null },
  ]);

  // What is in the database: three drafts in Pieter's name, through Claude, that no one else can see or hear about.
  for (const [i, row] of rows.entries()) {
    assert.equal(row.status, "DRAFT");
    assert.equal(row.createdByUserId, pieter.id);
    assert.equal(row.autoKey, draftAutoKey(pieter.id, batchKey, i));
    const created = await prisma.taskEvent.findFirst({ where: { taskId: row.id, kind: "CREATED" } });
    assert.equal(created?.source, "CLAUDE");
    assert.equal(created?.actorUserId, pieter.id);
  }
  const ids = rows.map((r) => r.id);
  assert.equal(await prisma.taskAccess.count({ where: { taskId: { in: ids } } }), 0);
  assert.equal(await prisma.notificationOutbox.count({ where: { taskId: { in: ids } } }), 0);
  assert.equal(await prisma.task.count({ where: { ...listedTask, id: { in: ids } } }), 0);
  assert.deepEqual([rows[0].assigneeContactId, rows[0].propertyId, rows[0].unitLabel, toYmd(rows[0].dueDate), rows[0].description], [zackId, duplexId, "2", due, "Faucet drips. Closet door is off its track."]);
  // His yes is saved where tenants live; his no is saved as no.
  assert.ok(rows[0].entryPermittedAt);
  assert.equal(rows[1].entryPermittedAt, null);
  assert.deepEqual([rows[1].assigneeContactId, rows[1].propertyId, rows[1].unitLabel], [robId, houseId, null]);
  // No one named is the partner himself.
  assert.deepEqual([rows[2].assigneeUserId, rows[2].assigneeContactId, rows[2].propertyId], [pieter.id, null, null]);
  assert.deepEqual((await prisma.taskChecklistItem.findMany({ where: { taskId: rows[0].id }, orderBy: { position: "asc" } })).map((c) => c.title), ["Fix the faucet", "Rehang the closet door"]);
  assert.deepEqual(logged, []);
});

test("the same save sent again answers its ids and links and nothing of the tasks; other drafts under its key are refused", { skip, timeout }, async () => {
  const deps = depsWith(pieterClaude.key);
  const batchKey = randomUUID();
  const args = { batchKey, drafts: [{ title: `Clean the gutters ${run}`, propertyId: duplexId, wholeBuilding: true, assignee: `c:${zackId}` }, { title: `Order mulch ${run}` }] };
  const first = await callTool<SaveDraftsSaved>(deps, pieterClaude, "save_drafts", args);
  assert.equal(first.body.saved, 2);
  const refs = first.body.drafts.map((d) => ({ id: d.id, link: d.link }));

  const again = await callTool<SaveDraftsReplayed>(deps, pieterClaude, "save_drafts", args);
  assert.equal(again.isError, false);
  assert.deepEqual(again.body, { saved: 2, alreadySaved: true, tasksLink: `${APP_URL}/tasks`, drafts: refs, message: "This batchKey already saved these 2 drafts. Nothing new was saved." });

  // A partner adds the first, then renames it, hands it to Rob and dates it. The same call again reads none of that back.
  await prisma.$transaction((tx) => core.addDraft(tx, refs[0].id, staff(connor)));
  await prisma.$transaction((tx) => core.patchTask(tx, refs[0].id, { title: `Gutters, gate code 4471 ${run}`, assignee: { contactId: robId }, dueDate: nextWeek() }, staff(connor)));
  const later = await callTool<SaveDraftsReplayed>(deps, pieterClaude, "save_drafts", args);
  assert.deepEqual(later.body, again.body);
  for (const word of ["4471", "Rob", "Zack", "gutters", "Gutters", "933"]) assert.ok(!later.text.includes(word), word);

  // Other drafts under the same key: refused, nothing saved, nothing read back, and not judged (a past date here is never looked at).
  const other = await callTool<SaveDraftsRefused>(deps, pieterClaude, "save_drafts", { batchKey, drafts: [{ title: `Something else ${run}`, due: "2020-01-01" }] });
  assert.equal(other.isError, true);
  assert.deepEqual(other.body, { saved: 0, message: "This batchKey was already used for a different save. Send these drafts again with a new batchKey.", problems: [] });

  // Sent twice at once, a new key still saves once.
  const racedKey = randomUUID();
  const raced = await Promise.all([1, 2].map(() => callTool<SaveDraftsSaved | SaveDraftsReplayed>(deps, pieterClaude, "save_drafts", { batchKey: racedKey, drafts: [{ title: `Raced ${run}` }] })));
  assert.deepEqual(raced.map((r) => r.body.alreadySaved).sort(), [false, true]);

  assert.equal((await batchRows(pieter.id, batchKey)).length, 2);
  assert.equal((await batchRows(pieter.id, racedKey)).length, 1);
  assert.equal(await prisma.task.count({ where: { title: { in: [`Order mulch ${run}`, `Something else ${run}`, `Raced ${run}`] } } }), 2);

  // The other partner's Claude, with the same key at his own address, saves his own.
  const his = await callTool<SaveDraftsSaved>(depsWith(connorClaude.key), connorClaude, "save_drafts", { batchKey, drafts: [{ title: `Connor's own ${run}` }] });
  assert.equal(his.body.alreadySaved, false);
  assert.equal(his.body.drafts[0].summary, `Connor ${run} · No date`);
  assert.equal((await batchRows(connor.id, batchKey))[0].createdByUserId, connor.id);
  assert.deepEqual(logged, []);
});

test("one bad draft and none is saved", { skip, timeout }, async () => {
  const deps = depsWith(pieterClaude.key);
  const batchKey = randomUUID();
  const drafts = [
    { title: `Good one ${run}`, propertyId: duplexId, unitLabel: "1", assignee: `c:${zackId}` },
    // Unit 2 has tenants and nobody said whether Zack can go in.
    { title: `Fix the faucet ${run}`, propertyId: duplexId, unitLabel: "2", assignee: `c:${zackId}` },
    { title: `Trim the hedge ${run}`, propertyId: archivedPropertyId, assignee: `c:${goneId}`, due: "2020-01-01" },
  ];
  const refusedSave = await callTool<SaveDraftsRefused>(deps, pieterClaude, "save_drafts", { batchKey, drafts });
  assert.equal(refusedSave.isError, true);
  assert.equal(refusedSave.body.saved, 0);
  assert.deepEqual(refusedSave.body.problems.map((p) => [p.draft, p.title]), [[2, `Fix the faucet ${run}`], [3, `Trim the hedge ${run}`]]);
  assert.deepEqual(refusedSave.body.problems[0].problems, [`Draft 2: ask whether Zack${run} can go in at Unit 2 without the tenants there. Then send entryPermitted as true or false.`]);
  // The archived property and the archived contractor get the line a made-up id gets, and neither is named.
  assert.deepEqual(refusedSave.body.problems[1].problems, [
    "Draft 3: that property isn't in the directory. Call get_directory and pick from it.",
    "Draft 3: that person isn't in the directory. Call get_directory and pick from it.",
    `Draft 3: the due date ${new Date("2020-01-01T00:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" })} is in the past. Today is ${new Date(`${todayYmdEastern()}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" })}. Ask him which day.`,
  ]);
  assert.ok(!refusedSave.text.includes(`Gone ${run}`) && !refusedSave.text.includes(`7 ${run}`));
  assert.equal((await batchRows(pieter.id, batchKey)).length, 0);
  assert.equal(await prisma.task.count({ where: { title: { in: drafts.map((d) => d.title) } } }), 0);

  // Asked, answered and fixed: the same key now saves all three.
  const fixed = await callTool<SaveDraftsSaved>(deps, pieterClaude, "save_drafts", {
    batchKey,
    drafts: [drafts[0], { ...drafts[1], entryPermitted: false }, { title: `Trim the hedge ${run}`, propertyId: houseId, due: nextWeek() }],
  });
  assert.equal(fixed.isError, false);
  assert.equal((await batchRows(pieter.id, batchKey)).length, 3);
});

test("a save accepts exactly the people the directory lists, and its refusal names nobody", { skip, timeout }, async () => {
  const deps = depsWith(pieterClaude.key);
  const directory = await callTool<Directory>(deps, pieterClaude, "get_directory", {});
  const listed = new Set(directory.body.people.contractors.map((c) => c.id));
  const notListed = [{ draft: 1, title: `Gutters ${run}`, problems: ["Draft 1: that person isn't in the directory. Call get_directory and pick from it."] }];
  for (const [id, name] of [[newId, "Zack"], [unlistedId, "Nobody"], [inactiveId, "Ivy"], [goneId, "Gone"]] as const) {
    assert.ok(!listed.has(`c:${id}`));
    const batchKey = randomUUID();
    const answer = await callTool<SaveDraftsRefused>(deps, pieterClaude, "save_drafts", { batchKey, drafts: [{ title: `Gutters ${run}`, assignee: `c:${id}`, entryPermitted: true }] });
    assert.equal(answer.isError, true, name);
    assert.deepEqual(answer.body.problems, notListed, name);
    assert.ok(!answer.text.includes(name), name);
    assert.equal((await batchRows(pieter.id, batchKey)).length, 0);
  }
  // Everyone it does list can be given a draft.
  for (const id of [zackId, robId, annId]) assert.ok(listed.has(`c:${id}`));
  assert.equal(await prisma.task.count({ where: { assigneeContactId: { in: [newId, unlistedId, inactiveId, goneId] } } }), 0);
  assert.deepEqual(logged, []);
});

test("text the database can't store is refused in words, with nothing logged and no save spent", { skip, timeout }, async () => {
  const deps = depsWith(pieterClaude.key);
  const nul = String.fromCharCode(0);
  const cases: [string, Record<string, unknown>][] = [
    ["the title", { title: `Fix${nul} the door ${run}` }],
    ["the notes", { title: `Fix the door ${run}`, notes: `Sticks${nul}` }],
    ["checklist item 1", { title: `Fix the door ${run}`, checklist: [`Plane${nul} it`] }],
    ["the title", { title: `Fix${String.fromCharCode(0xd800)} the door ${run}` }],
  ];
  // More tries than the hour's ten saves.
  for (let round = 0; round < 3; round++) {
    for (const [field, draft] of cases) {
      const answer = await callTool<SaveDraftsRefused>(deps, pieterClaude, "save_drafts", { batchKey: randomUUID(), drafts: [draft] });
      assert.equal(answer.isError, true);
      assert.deepEqual(answer.body.problems, [{ draft: 1, title: null, problems: [`Draft 1: ${field} has characters that can't be saved. Send it again in plain text.`] }]);
    }
  }
  // An id with a NUL in it is "not in the directory", and never a query.
  for (const draft of [{ title: `Gutters ${run}`, propertyId: `${duplexId}${nul}` }, { title: `Gutters ${run}`, assignee: `c:${zackId}${nul}` }]) {
    const answer = await callTool<SaveDraftsRefused>(deps, pieterClaude, "save_drafts", { batchKey: randomUUID(), drafts: [draft] });
    assert.match(answer.body.problems[0].problems[0], /^Draft 1: that (property|person) isn't in the directory\. Call get_directory and pick from it\.$/);
  }
  assert.deepEqual(logged, []);
  assert.equal(await prisma.task.count({ where: { title: { contains: `the door ${run}` } } }), 0);
  // The budget is whole: a clean save on the same connection goes through.
  const clean = await callTool<SaveDraftsSaved>(deps, pieterClaude, "save_drafts", { batchKey: randomUUID(), drafts: [{ title: `Fix the door ${run}`, notes: `Sticks at the top${String.fromCharCode(0x200b)}.` }] });
  assert.equal(clean.isError, false);
  // And what nobody can see wasn't stored.
  assert.equal((await prisma.task.findUniqueOrThrow({ where: { id: clean.body.drafts[0].id } })).description, "Sticks at the top.");
});

test("a contractor's job at a building with two units names the unit or the whole building, and a partner's own task keeps no Permission to enter", { skip, timeout }, async () => {
  const deps = depsWith(pieterClaude.key);
  const batchKey = randomUUID();
  const job = { title: `Fix the faucet ${run}`, propertyId: duplexId, assignee: `c:${zackId}` };
  const asked = await callTool<SaveDraftsRefused>(deps, pieterClaude, "save_drafts", { batchKey, drafts: [job] });
  assert.deepEqual(asked.body.problems[0].problems, [`Draft 1: 933 ${run} Ave has units 1 and 2. Ask which unit, or send wholeBuilding true if the job is the whole building's.`]);
  assert.equal((await batchRows(pieter.id, batchKey)).length, 0);

  // The whole building's job saves with no unit; a partner's own task at the lived-in unit saves, and his yes isn't kept.
  const saved = await callTool<SaveDraftsSaved>(deps, pieterClaude, "save_drafts", {
    batchKey,
    drafts: [{ ...job, wholeBuilding: true }, { title: `Walk unit 2 ${run}`, propertyId: duplexId, unitLabel: "2", entryPermitted: true }],
  });
  assert.equal(saved.isError, false);
  const rows = await batchRows(pieter.id, batchKey);
  assert.deepEqual(rows.map((r) => [r.unitLabel, r.assigneeContactId, r.assigneeUserId, r.entryPermittedAt]), [[null, zackId, null, null], ["2", null, pieter.id, null]]);
});

test("a draft the task service refuses after others were written takes them back with it", { skip, timeout }, async () => {
  // Ann is archived after the checks read her and before the save runs: the task service's own rule stops the second draft.
  const deps = depsWith(pieterClaude.key, {
    save: async (user, batchKey, drafts, check) => {
      await prisma.contact.update({ where: { id: annId }, data: { archivedAt: new Date() } });
      return save(user, batchKey, drafts, check);
    },
  });
  const batchKey = randomUUID();
  const answer = await callTool<SaveDraftsRefused>(deps, pieterClaude, "save_drafts", { batchKey, drafts: [{ title: `Written first ${run}` }, { title: `For Ann ${run}`, assignee: `c:${annId}` }] });
  assert.equal(answer.isError, true);
  // Told only that the directory changed: not who, and not that she was archived.
  assert.deepEqual(answer.body, { saved: 0, message: "Nothing was saved. The directory changed while this was saving. Call get_directory again, then send every draft again.", problems: [] });
  assert.equal((await batchRows(pieter.id, batchKey)).length, 0);
  assert.equal(await prisma.task.count({ where: { title: { in: [`Written first ${run}`, `For Ann ${run}`] } } }), 0);
});

test("whether a home has tenants is decided as the task service decides it", { skip, timeout }, async () => {
  const now = new Date();
  const today = todayYmdEastern(now);
  const facts = await loadSaveFacts(prisma, [{ title: "x", propertyId: duplexId }, { title: "x", propertyId: houseId }], now);
  for (const [propertyId, unitLabel] of [[duplexId, "1"], [duplexId, "2"], [duplexId, null], [duplexId, "9"], [houseId, null]] as [string, string | null][]) {
    const p = facts.properties.get(propertyId)!;
    assert.equal(livingTenants(p.units, p.leases, unitLabel, today) !== null, await homeOccupied(prisma, propertyId, unitLabel, now), `${propertyId} ${unitLabel}`);
  }
  assert.deepEqual(livingTenants(facts.properties.get(duplexId)!.units, facts.properties.get(duplexId)!.leases, "2", today), [`Dana ${run}`]);
});

test("2026-07-28, with no handshake, on the same token", { skip, timeout }, async () => {
  const deps = depsWith(pieterClaude.key);
  const meta = { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": { name: "test", version: "1" }, "io.modelcontextprotocol/clientCapabilities": {} };
  const headers = (method: string, name?: string) => ({ "mcp-protocol-version": "2026-07-28", "mcp-method": method, ...(name ? { "mcp-name": name } : {}) });

  const discover = await post(rpc(1, "server/discover", { _meta: meta }), pieterClaude, deps, headers("server/discover"));
  assert.equal(discover.status, 200);
  assert.deepEqual(((await discover.json()) as RpcBody).result?.supportedVersions, ["2026-07-28"]);

  const batchKey = randomUUID();
  const call = await post(rpc(2, "tools/call", { name: "save_drafts", arguments: { batchKey, drafts: [{ title: `Stateless ${run}` }] }, _meta: meta }), pieterClaude, deps, headers("tools/call", "save_drafts"));
  assert.equal(call.status, 200);
  const { result } = (await call.json()) as RpcBody;
  assert.equal(result?.resultType, "complete");
  assert.equal(result?.isError, false);
  assert.equal((await batchRows(pieter.id, batchKey)).length, 1);
});

test("the same call sent again is the same save, though a unit was relabeled and the contractor archived in between", { skip, timeout }, async () => {
  const deps = depsWith(pieterClaude.key);
  // A contractor and a building of this test's own, so nothing here changes what the other tests read.
  const yuri = await made.contact({ fullName: `Yuri${run} Stone`, tradeLinks: { create: [{ tradeId }] } });
  const units = (second: string) => [{ id: `${run}-r1`, label: "1" }, { id: `${run}-r2`, label: second }];
  const building = await made.property({ address: `415 ${run} Ave, Buffalo, NY 14209`, units: units("2a") });
  const batchKey = randomUUID();
  const args = { batchKey, drafts: [{ title: `Regrout the tub ${run}`, propertyId: building.id, unitLabel: "2a", assignee: `c:${yuri.id}`, heard: { person: "Yuri" } }, { title: `Order gravel ${run}` }] };
  const first = await callTool<SaveDraftsSaved>(deps, pieterClaude, "save_drafts", args);
  assert.equal(first.body.saved, 2);
  const refs = first.body.drafts.map((d) => ({ id: d.id, link: d.link }));
  const replayed = async (what: string) => {
    const again = await callTool<SaveDraftsReplayed>(deps, pieterClaude, "save_drafts", args);
    assert.deepEqual([again.isError, again.body.alreadySaved, again.body.drafts], [false, true, refs], what);
  };

  // The answer to the first send was lost. Before Claude sends it again, a partner retypes the unit's label.
  await prisma.property.update({ where: { id: building.id }, data: { units: units("Unit 2A") } });
  await replayed("the unit relabeled");
  // Then the unit is removed, and Yuri is archived: the same arguments no longer pass a single check.
  await prisma.property.update({ where: { id: building.id }, data: { units: [{ id: `${run}-r1`, label: "1" }] } });
  await prisma.contact.update({ where: { id: yuri.id }, data: { archivedAt: new Date() } });
  await replayed("the unit gone and the contractor archived");
  const fresh = await callTool<SaveDraftsRefused>(deps, pieterClaude, "save_drafts", { ...args, batchKey: randomUUID() });
  assert.equal(fresh.isError, true, "as a new save it would be refused");
  // Nothing was written twice, and other drafts under the key are still another save.
  assert.equal((await batchRows(pieter.id, batchKey)).length, 2);
  assert.equal(await prisma.task.count({ where: { title: { in: [`Regrout the tub ${run}`, `Order gravel ${run}`] } } }), 2);
  const other = await callTool<SaveDraftsRefused>(deps, pieterClaude, "save_drafts", { batchKey, drafts: [{ ...args.drafts[0], unitLabel: "1" }, args.drafts[1]] });
  assert.equal(other.body.message, "This batchKey was already used for a different save. Send these drafts again with a new batchKey.");
  assert.deepEqual(logged, []);
});

test("a save the task service refuses after the checks passed costs none of the hour's saves", { skip, timeout }, async () => {
  // One save an hour, so the count is plain to see. The same limiter stands behind both sets of bindings.
  const limits = { calls: new RateLimiter(CALLS_PER_MINUTE, MINUTE_MS), saves: new RateLimiter(1, HOUR_MS) };
  const deps = depsWith(pieterClaude.key, { limits });
  // Rob is archived the moment the checks have passed and the save has been counted, inside the save's own
  // transaction: the task service refuses his draft, and the archive is taken back with everything else.
  const racing = depsWith(pieterClaude.key, {
    limits,
    save: (user, batchKey, drafts, check) =>
      save(user, batchKey, drafts, async (tx) => {
        await check(tx);
        await tx.contact.update({ where: { id: robId }, data: { archivedAt: new Date() } });
      }),
  });
  const draft = { title: `Hang the gate ${run}`, assignee: `c:${robId}` };
  for (let i = 0; i < 3; i++) {
    const lost = await callTool<SaveDraftsRefused>(racing, pieterClaude, "save_drafts", { batchKey: randomUUID(), drafts: [draft] });
    assert.equal(lost.body.message, "Nothing was saved. The directory changed while this was saving. Call get_directory again, then send every draft again.", `try ${i + 1}`);
  }
  assert.equal(await prisma.task.count({ where: { title: draft.title } }), 0);
  assert.equal((await prisma.contact.findUniqueOrThrow({ where: { id: robId } })).archivedAt, null);

  // The hour's one save is still there for the send that goes through, and it is the one that counts.
  const saved = await callTool<SaveDraftsSaved>(deps, pieterClaude, "save_drafts", { batchKey: randomUUID(), drafts: [draft] });
  assert.deepEqual([saved.isError, saved.body.saved], [false, 1]);
  const over = await callTool<SaveDraftsRefused>(deps, pieterClaude, "save_drafts", { batchKey: randomUUID(), drafts: [{ title: `One more ${run}` }] });
  assert.match(over.body.message, /^Nothing was saved\. This connection has saved 10 times in the last hour\. Try again in \d+ minutes?\.$/);
  assert.equal(await prisma.task.count({ where: { title: { in: [draft.title, `One more ${run}`] } } }), 1);
  assert.deepEqual(logged, []);
});

test("a partner with 200 drafts waiting is told so, and the save that would pass it writes nothing", { skip, timeout }, async () => {
  const quinn = await made.user({ email: `full-${run}@example.test`, name: `Full ${run}`, passwordHash: "scrypt$x" });
  const claude = await connect(quinn);
  const deps = depsWith(claude.key);
  const drafts = (n: number, label: string) => Array.from({ length: n }, (_, i) => ({ title: `${label} ${i + 1} ${run}` }));
  // Eight full saves fill his My drafts to the cap, inside the hour's ten saves.
  for (let i = 0; i < MAX_WAITING_DRAFTS / 25; i++) assert.equal((await callTool<SaveDraftsSaved>(deps, claude, "save_drafts", { batchKey: randomUUID(), drafts: drafts(25, `Fill ${i}`) })).body.saved, 25);
  const batchKey = randomUUID();
  const over = await callTool<SaveDraftsRefused>(deps, claude, "save_drafts", { batchKey, drafts: drafts(1, "One more") });
  assert.equal(over.isError, true);
  assert.deepEqual(over.body, { saved: 0, message: `He already has ${MAX_WAITING_DRAFTS} drafts waiting in HG Capital. Ask him to add or discard some, then save again.`, problems: [] });
  assert.equal((await batchRows(quinn.id, batchKey)).length, 0);
  assert.equal(await prisma.task.count({ where: { createdByUserId: quinn.id, status: "DRAFT" } }), MAX_WAITING_DRAFTS);
  // The other partner's Claude is not held by it.
  assert.equal((await callTool<SaveDraftsSaved>(depsWith(connorClaude.key), connorClaude, "save_drafts", { batchKey: randomUUID(), drafts: drafts(1, "Connor's") })).isError, false);
});

test("a token whose connection was ended is the 401 again, and saves nothing", { skip, timeout }, async () => {
  const quinn = await made.user({ email: `quinn-${run}@example.test`, name: `Quinn ${run}`, passwordHash: "scrypt$x" });
  const claude = await connect(quinn);
  const deps = depsWith(claude.key);
  const batchKey = randomUUID();
  assert.equal((await callTool<SaveDraftsSaved>(deps, claude, "save_drafts", { batchKey, drafts: [{ title: `Before ${run}` }] })).body.saved, 1);

  // Disconnect, tapped by the other partner.
  assert.equal((await disconnect(prisma, { userId: quinn.id }, { id: pieter.id }, { now: new Date(), ipHash: "ip" })).ok, true);
  const res = await post(rpc(1, "tools/call", { name: "save_drafts", arguments: { batchKey: randomUUID(), drafts: [{ title: `After ${run}` }] } }), claude, deps);
  assert.equal(res.status, 401);
  assert.match(res.headers.get("www-authenticate") ?? "", /^Bearer error="invalid_token", resource_metadata="/);
  assert.equal(await prisma.task.count({ where: { title: `After ${run}` } }), 0);
  assert.equal(await prisma.task.count({ where: { title: `Before ${run}` } }), 1);
});
