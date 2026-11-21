import type { Prisma, PrismaClient, Task } from "@prisma/client";
import { z } from "zod";
import { fmtDay, todayYmdEastern, toYmd, type Ymd } from "@/lib/dates";
import { shortAddress } from "@/lib/normalize";
import { unitDisplay } from "@/lib/picker-options-shape";
import { JOB_EMAIL_SELECT, type JobEmailFacts } from "@/lib/portal/job-emails";
import { parseUnits, type PropertyUnit } from "@/lib/property-types";
import type { RateLimiter } from "@/lib/rate-limit";
import { TaskRuleError, type DraftInput, type SaveDraftsResult, type Tx } from "@/lib/tasks/core";
import { draftContractor, draftEmailLine, nameAmong, nameList, type DraftPeople } from "@/lib/tasks/drafts";
import { CHECKLIST_ITEM_MAX, NOTES_MAX, TITLE_MAX, TOO_LONG, UNIT_MAX } from "@/lib/tasks/limits";
import type { VerifiedAccess } from "./connections-core";
import {
  CAP,
  DIRECTORY_CONTRACTORS,
  DIRECTORY_PROPERTIES,
  LEASE_SELECT,
  clip,
  getDirectory,
  listedName,
  livingTenants,
  offeredUnitLabels,
  openLeasesWhere,
  partnerName,
  seenText,
  type LeaseRow,
} from "./directory";
import {
  CHECKLIST_MAX,
  CONNECTOR_NAME,
  CONNECTOR_VERSION,
  DRAFTS_MAX,
  FIELD,
  GET_DIRECTORY,
  GET_DIRECTORY_DESCRIPTION,
  GET_DIRECTORY_TITLE,
  SAVE_DRAFTS,
  SAVE_DRAFTS_DESCRIPTION,
  SAVE_DRAFTS_TITLE,
  SERVER_INSTRUCTIONS,
} from "./instructions";

/**
 * The connector (docs/specs/tasks-from-claude.md, section 5): one MCP endpoint
 * with two tools, as a function from a Request to a Response. get_directory
 * reads (directory.ts); save_drafts checks every draft and saves them all or
 * none, through the task service, in the partner's own name. A save takes
 * exactly the properties and people the directory lists, and every string
 * that comes from a record leaves through directory.ts `clip`.
 *
 * The protocol is written out here, with no MCP package: stateless Streamable
 * HTTP, one JSON-RPC message per POST, always a JSON answer, no session and
 * no stream. It speaks both shapes the MCP specification has had:
 *
 *  - the handshake one (2025-11-25 and earlier): `initialize`, then
 *    `notifications/initialized`, `ping`, `tools/list`, `tools/call`;
 *  - the per-request one (2026-07-28): no handshake, the version in each
 *    request's `_meta` and in its headers, `server/discover`, `tools/list`,
 *    `tools/call`.
 *
 * tools.conformance.test.ts asks the official MCP server the same requests and
 * holds this one to its statuses and codes.
 *
 * Nothing here loads Next or reads the environment. /api/mcp/<key> binds the bearer
 * check, the database, the task service and the limiters (McpDeps), so the
 * database test drives the same function with its own (tools.pg.test.ts).
 * Request bodies and tokens are never logged.
 */

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

/** Per connection, on the app's limiter (rate-limit.ts), so per server instance: soft caps. */
export const CALLS_PER_MINUTE = 30;
export const SAVES_PER_HOUR = 10;
export const MINUTE_MS = 60_000;
export const HOUR_MS = 3_600_000;

/** The largest request read: 25 drafts with the longest notes the app saves fit several times over. */
export const BODY_MAX = 1_000_000;

/**
 * The longest a batch key runs (tasks/drafts.ts DRAFT_BATCH_KEY_MAX), in the
 * characters a UUID uses. It is meant to be random: a key that can be guessed
 * is a key someone else can send again.
 */
const BATCH_KEY = /^[A-Za-z0-9._-]{1,100}$/;
/** A record's id as the directory gives it: the database's own letters and digits. Nothing else is ever looked up. */
const RECORD_ID = /^[A-Za-z0-9_-]{1,100}$/;
/** A person's id as the directory gives it: "u:<id>" for a partner, "c:<id>" for a contractor. */
const PERSON_KEY = /^([uc]):([A-Za-z0-9_-]{1,100})$/;
const HEARD_MAX = 120;
/** A due date is ten characters; this leaves room for the spaces a model puts round one. */
const DUE_RAW_MAX = 40;

/** The most lines one refusal carries, and the most it says about one draft: a refusal's size never follows the request's. */
export const PROBLEM_LINES_MAX = 40;
export const DRAFT_LINES_MAX = 6;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

// ---------------------------------------------------------------------------
// The two tools
// ---------------------------------------------------------------------------

const draftArgs = z.object({
  title: z.string().describe(FIELD.title),
  notes: z.string().optional().describe(FIELD.notes),
  propertyId: z.string().optional().describe(FIELD.propertyId),
  unitLabel: z.string().optional().describe(FIELD.unitLabel),
  wholeBuilding: z.boolean().optional().describe(FIELD.wholeBuilding),
  assignee: z.string().optional().describe(FIELD.assignee),
  due: z.string().optional().describe(FIELD.due),
  entryPermitted: z.boolean().optional().describe(FIELD.entryPermitted),
  checklist: z.array(z.string()).optional().describe(FIELD.checklist),
  heard: z
    .object({ property: z.string().optional().describe(FIELD.heardProperty), person: z.string().optional().describe(FIELD.heardPerson) })
    .optional()
    .describe(FIELD.heard),
});

/** save_drafts' arguments by shape. The limits are checked in words Claude can act on (sizeProblem, checkDrafts), not here. */
export const saveDraftsArgs = z.object({
  batchKey: z.string().describe(FIELD.batchKey),
  drafts: z.array(draftArgs).describe(FIELD.drafts),
});

export type DraftArgs = z.infer<typeof draftArgs>;

/** A zod shape as a tool's input schema. The dialect line is left off: 2020-12 is what MCP reads a schema as without one. */
function inputSchemaOf(schema: z.ZodType): Record<string, unknown> {
  const json: Record<string, unknown> = { ...z.toJSONSchema(schema) };
  delete json.$schema;
  return json;
}

export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: { title: string; readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean; openWorldHint: boolean };
}

/** What tools/list answers, in a fixed order. */
export const TOOLS: readonly ToolDefinition[] = [
  {
    name: GET_DIRECTORY,
    title: GET_DIRECTORY_TITLE,
    description: GET_DIRECTORY_DESCRIPTION,
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { title: GET_DIRECTORY_TITLE, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: SAVE_DRAFTS,
    title: SAVE_DRAFTS_TITLE,
    description: SAVE_DRAFTS_DESCRIPTION,
    inputSchema: inputSchemaOf(saveDraftsArgs),
    // It only adds drafts, and the same batchKey sent again adds nothing.
    annotations: { title: SAVE_DRAFTS_TITLE, readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
];

// ---------------------------------------------------------------------------
// save_drafts: what a refusal says
// ---------------------------------------------------------------------------

/** One draft's problems, in words that say what to ask him or what to fix. `draft` counts from 1; null is the call itself. */
export interface DraftProblems {
  draft: number | null;
  title: string | null;
  /** Each line of a draft's starts "Draft 2: ", so it reads whole wherever Claude quotes it. */
  problems: string[];
}

const MORE_LEFT_OUT = "More problems were left out. Fix these first, then send every draft again.";

/**
 * A refusal's lines, kept to a fixed size: at most PROBLEM_LINES_MAX in all
 * and DRAFT_LINES_MAX for one draft, pushed in place. Whatever is sent, the
 * answer stays small and the work of building it stays in step with the
 * lines kept, never with the lines there could have been.
 */
class ProblemList {
  private readonly groups = new Map<number | null, DraftProblems>();
  private lines = 0;
  private cut = false;

  /** `line` starts lower case for a draft's ("the title needs..."), since "Draft 2: " goes in front of it. */
  add(draft: number | null, line: string, title: string | null = null): void {
    let group = this.groups.get(draft);
    if (this.lines >= PROBLEM_LINES_MAX || (group && group.problems.length >= DRAFT_LINES_MAX)) {
      this.cut = true;
      return;
    }
    if (!group) {
      group = { draft, title, problems: [] };
      this.groups.set(draft, group);
    }
    group.problems.push(draft === null ? line : `Draft ${draft}: ${line}`);
    this.lines++;
  }

  get size(): number {
    return this.lines;
  }

  list(): DraftProblems[] {
    const all = [...this.groups.values()];
    if (this.cut) all.push({ draft: null, title: null, problems: [MORE_LEFT_OUT] });
    return all;
  }
}

/**
 * The one line for a property, a unit or a person a draft names that the
 * directory doesn't list. The same words whether the id is made up, archived,
 * inactive, not kept yet or not an id at all, so a refusal never says which,
 * and never names a record back.
 */
const NOT_LISTED = {
  property: `that property isn't in the directory. Call ${GET_DIRECTORY} and pick from it.`,
  unit: `that unit isn't in the directory. Call ${GET_DIRECTORY} and pick from it.`,
  person: `that person isn't in the directory. Call ${GET_DIRECTORY} and pick from it.`,
} as const;

const LINE = {
  batchKey: "The batchKey needs 1 to 100 letters, digits, dots, dashes or underscores. A random UUID works.",
  noBatchKey: "Send a batchKey: a new random id for this set of drafts.",
  draftsList: `Send drafts as a list of 1 to ${DRAFTS_MAX}.`,
  draftsCount: (count: number) => `Send 1 to ${DRAFTS_MAX} drafts in one call. This one has ${count}.`,
  title: `the title needs 2 to ${TITLE_MAX} characters.`,
  // The app's own line for notes that are too long (tasks/limits.ts), after "Draft 2: ".
  notes: `${TOO_LONG.notes.charAt(0).toLowerCase()}${TOO_LONG.notes.slice(1)}`,
  checklistCount: `a checklist holds up to ${CHECKLIST_MAX} items. Trim it, or split the visit into two drafts.`,
  checklistItem: (n: number) => `checklist item ${n} is over ${CHECKLIST_ITEM_MAX} characters. Shorten it.`,
  heard: `heard is over ${HEARD_MAX} characters. Shorten it.`,
  notADate: (said: string) => `${said} isn't a date. Send the due date as YYYY-MM-DD.`,
  unsavable: (field: string) => `${field} has characters that can't be saved. Send it again in plain text.`,
} as const;

// ---------------------------------------------------------------------------
// save_drafts: the checks that read no record
// ---------------------------------------------------------------------------

/**
 * Whether a call is too big to look at, as one line, or null. It runs on the
 * raw arguments before anything else reads them: zod reports on every entry
 * of a list however long, so a list of half a million numbers would be half
 * a million lines. Here `drafts` has to be a list of 1 to 25, each checklist
 * a list of 20 or fewer, and every string within its limit. The first thing
 * that isn't is the whole answer, and nothing more is looked at.
 */
export function sizeProblem(args: unknown): { draft: number | null; line: string } | null {
  if (!isRecord(args)) return null;
  if (typeof args.batchKey === "string" && args.batchKey.length > 200) return { draft: null, line: LINE.batchKey };
  const drafts = args.drafts;
  if (!Array.isArray(drafts)) return { draft: null, line: LINE.draftsList };
  if (drafts.length < 1 || drafts.length > DRAFTS_MAX) return { draft: null, line: LINE.draftsCount(drafts.length) };
  const over = (value: unknown, max: number) => typeof value === "string" && value.length > max;
  for (const [index, d] of drafts.entries()) {
    if (!isRecord(d)) continue;
    const said = (line: string) => ({ draft: index + 1, line });
    if (over(d.title, TITLE_MAX)) return said(LINE.title);
    if (over(d.notes, NOTES_MAX)) return said(LINE.notes);
    if (over(d.propertyId, 100)) return said(NOT_LISTED.property);
    // Counted in UTF-16 units here; unitLabelOf holds the label to UNIT_MAX code points, as clip does.
    if (over(d.unitLabel, UNIT_MAX * 2)) return said(NOT_LISTED.unit);
    if (over(d.assignee, 102)) return said(NOT_LISTED.person);
    if (over(d.due, DUE_RAW_MAX)) return said(LINE.notADate("that"));
    if (Array.isArray(d.checklist)) {
      if (d.checklist.length > CHECKLIST_MAX) return said(LINE.checklistCount);
      const long = d.checklist.findIndex((item) => over(item, CHECKLIST_ITEM_MAX));
      if (long !== -1) return said(LINE.checklistItem(long + 1));
    }
    if (isRecord(d.heard) && (over(d.heard.property, HEARD_MAX) || over(d.heard.person, HEARD_MAX))) return said(LINE.heard);
  }
  return null;
}

/**
 * Text Postgres can't store, or that a line of text has no business holding:
 * a NUL, any other control character but a tab or a line break, and a lone
 * surrogate. A save with one would fail in the insert, every time it was
 * sent, so it is refused here in words Claude can act on.
 */
const UNSAVABLE = /\p{Cs}|[^\P{Cc}\t\n\r]/u;

/**
 * A draft's words without what nobody sees, by the cleaner the directory uses for a record's (directory.ts
 * seenText): zero-width and direction marks, variation selectors, fillers and the rest are dropped from what is
 * saved, so the stored text is the text a partner reads, and a title is measured by what can be read.
 */
const plain = seenText;

/** A property id shaped as the directory gives them, or null. */
function propertyIdOf(raw: string | null | undefined): string | null {
  const id = raw?.trim() ?? "";
  return RECORD_ID.test(id) ? id : null;
}

/** "u:<id>" or "c:<id>" as its two halves, or null for anything else. */
function personOf(raw: string | null | undefined): { kind: "u" | "c"; id: string } | null {
  const m = PERSON_KEY.exec(raw?.trim() ?? "");
  return m ? { kind: m[1] as "u" | "c", id: m[2] } : null;
}

/**
 * A unit label that could be one the directory gave: one line, as long as a label runs, with something to read in
 * it and nothing that can't be seen. The directory sends every label cleaned, so one that carries a hidden
 * character, or is made of nothing else, came from somewhere else and is never compared or named back.
 */
function unitLabelOf(raw: string | null | undefined): string | null {
  const label = raw?.trim() ?? "";
  const readable = !/\p{C}/u.test(label) && seenText(label) === label && clip(label, UNIT_MAX) !== null;
  // By code points, as clip cuts, so a label the directory lists whole is one a save takes.
  return label && [...label].length <= UNIT_MAX && readable ? label : null;
}

const given = (raw: string | undefined) => (raw?.trim() ?? "") !== "";

/**
 * One draft's problems that no record is needed to see: text that can't be
 * saved, and a property, unit or person that isn't shaped like anything the
 * directory gives. A draft with one is refused before a query runs, so none
 * of it reaches the database.
 */
function shapeProblems(d: DraftArgs): string[] {
  const said: string[] = [];
  const bad = (text: string | undefined) => text !== undefined && UNSAVABLE.test(text);
  if (bad(d.title)) said.push(LINE.unsavable("the title"));
  if (bad(d.notes)) said.push(LINE.unsavable("the notes"));
  d.checklist?.forEach((item, i) => {
    if (bad(item)) said.push(LINE.unsavable(`checklist item ${i + 1}`));
  });
  if (bad(d.heard?.property) || bad(d.heard?.person)) said.push(LINE.unsavable("heard"));
  if (given(d.propertyId) && !propertyIdOf(d.propertyId)) said.push(NOT_LISTED.property);
  if (given(d.unitLabel) && !unitLabelOf(d.unitLabel)) said.push(NOT_LISTED.unit);
  if (given(d.assignee) && !personOf(d.assignee)) said.push(NOT_LISTED.person);
  return said;
}

/**
 * The arguments, read without a single query: the parsed call, or what
 * doesn't fit, each said against its draft. In order: the size (sizeProblem),
 * the shape (zod), then the batchKey, the text and the ids (shapeProblems).
 * Nothing that fails here reaches the database or the save budget.
 */
export function parseSaveArgs(args: unknown): { ok: true; batchKey: string; drafts: DraftArgs[] } | { ok: false; problems: DraftProblems[] } {
  const said = new ProblemList();
  const big = sizeProblem(args);
  if (big) {
    said.add(big.draft, big.line);
    return { ok: false, problems: said.list() };
  }
  const parsed = saveDraftsArgs.safeParse(dropNulls(args));
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const [top, index, ...rest] = issue.path;
      const message = clip(issue.message, 120) ?? "";
      if (top === "drafts" && typeof index === "number") said.add(index + 1, `${rest.length ? rest.join(".") : "this draft"}: ${message}`);
      else if (top === "batchKey") said.add(null, LINE.noBatchKey);
      else if (top === "drafts") said.add(null, LINE.draftsList);
      else said.add(null, `${issue.path.join(".") || "The arguments"}: ${message}`);
    }
    return { ok: false, problems: said.list() };
  }
  const batchKey = parsed.data.batchKey.trim();
  if (!BATCH_KEY.test(batchKey)) said.add(null, LINE.batchKey);
  parsed.data.drafts.forEach((d, index) => {
    for (const line of shapeProblems(d)) said.add(index + 1, line);
  });
  if (said.size > 0) return { ok: false, problems: said.list() };
  return { ok: true, batchKey, drafts: parsed.data.drafts };
}

/** A model often sends null for a field it means to leave out: read those as left out, two levels down (a draft, its `heard`). */
function dropNulls(value: unknown, depth = 0): unknown {
  if (Array.isArray(value)) return depth < 3 ? value.map((v) => dropNulls(v, depth + 1)) : value;
  if (value === null || typeof value !== "object" || depth >= 4) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, v]) => v !== null)
      .map(([k, v]) => [k, dropNulls(v, depth + 1)]),
  );
}

// ---------------------------------------------------------------------------
// save_drafts: the checks against the records (spec section 5's table)
// ---------------------------------------------------------------------------

/** A draft's fields as the task service saves them, and the draft as Claude sent it (tasks/core.ts DraftInput). */
export type { DraftInput };

type Viewer = VerifiedAccess["user"];

type SaveReader = Pick<PrismaClient, "property" | "lease" | "user" | "contact"> | Pick<Prisma.TransactionClient, "property" | "lease" | "user" | "contact">;

const CONTACT_FACTS = { id: true, fullName: true, active: true, portalAccount: { select: JOB_EMAIL_SELECT } } satisfies Prisma.ContactSelect;
type UserFacts = { id: string; name: string | null; email: string };
/** A listed contractor, by the name the directory sends: cleaned and cut, so no line built from it carries more. */
type ContactFacts = { id: string; name: string; active: boolean; portalAccount: JobEmailFacts | null };
type PropertyFacts = { id: string; address: string; units: PropertyUnit[]; leases: LeaseRow[] };

/**
 * The records a save may name, as they stand: what the checks read. Only what
 * get_directory lists is ever here, so "not in these" is "not in the
 * directory".
 */
export interface SaveFacts {
  properties: Map<string, PropertyFacts>;
  users: Map<string, UserFacts>;
  contacts: Map<string, ContactFacts>;
}

/**
 * Reads the properties a save names, their open leases, and the people it
 * could mean, through the directory's own scope (directory.ts
 * DIRECTORY_PROPERTIES, DIRECTORY_CONTRACTORS): an id that is archived,
 * inactive, not kept yet or made up is simply not found. When a draft names
 * someone, every partner and listed contractor is read, not that one row, so
 * a line can tell two people with one first name apart (drafts.ts nameAmong).
 * Only ids shaped like the directory's are looked up.
 */
export async function loadSaveFacts(db: SaveReader, drafts: readonly DraftArgs[], now: Date): Promise<SaveFacts> {
  const propertyIds = [...new Set(drafts.flatMap((d) => propertyIdOf(d.propertyId) ?? []))];
  const named = drafts.flatMap((d) => personOf(d.assignee) ?? []);
  const [properties, leases, users, contacts] = await Promise.all([
    propertyIds.length ? db.property.findMany({ where: { ...DIRECTORY_PROPERTIES, id: { in: propertyIds } }, select: { id: true, address: true, units: true } }) : [],
    propertyIds.length ? db.lease.findMany({ where: openLeasesWhere(propertyIds, todayYmdEastern(now)), select: LEASE_SELECT }) : [],
    named.length ? db.user.findMany({ select: { id: true, name: true, email: true } }) : [],
    named.some((p) => p.kind === "c") ? db.contact.findMany({ where: DIRECTORY_CONTRACTORS, select: CONTACT_FACTS }) : [],
  ]);
  return {
    properties: new Map(properties.map((p) => [p.id, { id: p.id, address: p.address, units: parseUnits(p.units), leases: leases.filter((l) => l.propertyId === p.id) }])),
    users: new Map(users.map((u) => [u.id, u])),
    // A contractor whose name has nothing left to read isn't in the directory, so isn't here.
    contacts: new Map(
      contacts.flatMap((c): [string, ContactFacts][] => {
        const name = listedName(c.fullName);
        return name ? [[c.id, { id: c.id, name, active: c.active, portalAccount: c.portalAccount }]] : [];
      }),
    ),
  };
}

/** Everyone a first name in one of these lines could be read as: the partners and the listed contractors (drafts.ts DraftPeople). */
function peopleOf(facts: SaveFacts): DraftPeople {
  return [...[...facts.users.values()].map((u) => ({ key: `u:${u.id}`, name: partnerName(u) })), ...[...facts.contacts.values()].map((c) => ({ key: `c:${c.id}`, name: c.name }))];
}

const quoted = (words: string | undefined, fallback: string) => {
  const said = clip(words, HEARD_MAX);
  return said ? `"${said}"` : fallback;
};

/** "933 Lafayette Ave": a property by its street, as the app's rows name it. */
const streetOf = (address: string) => clip(shortAddress(address) || address, CAP.address) ?? "";

const dayWords = (day: Ymd, today: Ymd) => fmtDay(day, { weekday: true, year: "auto", now: today });

const oneLine = (words: string) => plain(words).replace(/\s+/g, " ").trim();

/** How a unit label is compared: one line, cut as the directory cuts it, any case. */
const unitKey = (label: string | null | undefined) => (clip(label, UNIT_MAX) ?? "").toLowerCase();

/** A unit as a line names it: "Unit 2", by the label as the directory sends it. Null for a label with nothing to read. */
const unitWords = (label: string | null | undefined) => {
  const shown = clip(label, UNIT_MAX);
  return shown ? unitDisplay(shown) : null;
};

/**
 * Every check of the spec's table, for every draft, before anything is saved.
 * Returns the drafts as the task service takes them and each draft's
 * problems; the save goes ahead only with none. Pure: `facts` are the records
 * the drafts name and `today` is Buffalo's. See tools.test.ts.
 *
 *  - the property, unit and person are ones the directory lists;
 *  - the unit belongs to that property;
 *  - the due date is today or later;
 *  - a contractor's job at a building with two or more units names the unit,
 *    or says it is the whole building's;
 *  - a contractor's job in a home with tenants says yes or no to Permission to enter;
 *  - the title is 2 to 300 characters.
 *
 * Permission to enter is kept only on a contractor's job: on a partner's own
 * task it is ignored, the way the task service ignores it for a home with no
 * tenants, so nobody's yes rides along to whoever the task is handed to later.
 *
 * Each draft also goes on as Claude sent it (`asSent`: its cleaned words and
 * the ids, label, date and answers it named, before any is matched to a
 * record). The task service tells a save sent twice by that alone (core.ts
 * draftsFingerprint), so a retry reads as the same save whatever changed in
 * between: a unit relabeled, a contractor archived, a week gone by. `heard`
 * is left out of it: the app doesn't keep those words.
 */
export function checkDrafts(drafts: readonly DraftArgs[], facts: SaveFacts, viewer: Pick<Viewer, "id">, today: Ymd): { inputs: DraftInput[]; problems: DraftProblems[] } {
  const inputs: DraftInput[] = [];
  const problems = new ProblemList();
  const people = peopleOf(facts);

  drafts.forEach((d, index) => {
    const said: string[] = [];
    // A title and a checklist item are one line each, as their fields in the app are.
    const title = oneLine(d.title);
    if (title.length < 2 || title.length > TITLE_MAX) said.push(LINE.title);
    const notes = plain(d.notes ?? "").trim() || null;
    if (notes && notes.length > NOTES_MAX) said.push(LINE.notes);

    // The property.
    const property = facts.properties.get(propertyIdOf(d.propertyId) ?? "") ?? null;
    if (given(d.propertyId) && !property) said.push(NOT_LISTED.property);

    // The unit, which has to be that property's.
    const givenUnit = d.unitLabel?.trim() || null;
    let unitLabel: string | null = null;
    // False once a unit was named that the property doesn't have: which home the job is in isn't known.
    let homeKnown = true;
    if (givenUnit && !given(d.propertyId)) {
      said.push("a unit needs its property. Send propertyId too, or ask him which property.");
    } else if (givenUnit && !unitLabelOf(givenUnit)) {
      homeKnown = false;
      said.push(NOT_LISTED.unit);
    } else if (givenUnit && property) {
      // Only a unit the directory lists is a unit here: a rentable one with a label that can be read. A house-meter
      // row is nobody's home, so naming one never stands in for the unit or passes by Permission to enter.
      const labels = offeredUnitLabels(property.units);
      const match = labels.find((label) => unitKey(label) === unitKey(givenUnit)) ?? null;
      if (match) {
        unitLabel = match;
      } else {
        homeKnown = false;
        const street = streetOf(property.address);
        const offered = labels.flatMap((label) => clip(label, UNIT_MAX) ?? []).join(", ");
        said.push(offered ? `${street} has no unit ${quoted(givenUnit, "by that name")}. Its units: ${offered}. Ask him which unit.` : `${street} has no units. Leave unitLabel out.`);
      }
    }

    // The person. Nobody named is the partner himself (D7).
    const person = personOf(d.assignee);
    let assignee: DraftInput["assignee"] = { userId: viewer.id };
    let contractor: ContactFacts | null = null;
    if (person?.kind === "u" && facts.users.has(person.id)) assignee = { userId: person.id };
    else if (person?.kind === "c" && facts.contacts.has(person.id)) {
      contractor = facts.contacts.get(person.id) ?? null;
      assignee = { contactId: person.id };
    } else if (given(d.assignee)) said.push(NOT_LISTED.person);

    // The due date: one date, never in the past (D8).
    const givenDue = d.due?.trim() || null;
    let dueDate: Ymd | null = null;
    if (givenDue) {
      const day = /^\d{4}-\d{2}-\d{2}$/.test(givenDue) ? toYmd(givenDue) : null;
      if (!day) said.push(LINE.notADate(quoted(givenDue, "that")));
      else {
        dueDate = day;
        if (day < today) said.push(`the due date ${dayWords(day, today)} is in the past. Today is ${dayWords(today, today)}. Ask him which day.`);
      }
    }

    // A contractor's job says which home: the unit, or that it is the whole building's (roof, gutters, the yard).
    if (contractor && property && !givenUnit && d.wholeBuilding !== true) {
      const offered = offeredUnitLabels(property.units).flatMap((label) => clip(label, UNIT_MAX) ?? []);
      if (offered.length >= 2) said.push(`${streetOf(property.address)} has units ${nameList(offered)}. Ask which unit, or send wholeBuilding true if the job is the whole building's.`);
    }

    // Permission to enter: a contractor's job in a home with tenants needs his yes or no.
    if (contractor && property && homeKnown && d.entryPermitted === undefined && livingTenants(property.units, property.leases, unitLabel, today)) {
      // The first name, or the whole name when someone else the directory lists goes by it.
      const who = nameAmong({ key: `c:${contractor.id}`, name: contractor.name }, people);
      const where = unitWords(unitLabel) ?? streetOf(property.address);
      said.push(`ask whether ${who} can go in at ${where} without the tenants there. Then send entryPermitted as true or false.`);
    }

    // The checklist. An item left blank is dropped, as the task page drops one. An item that held something with
    // nothing in it to read is said, by its place in what was sent, never dropped without a word.
    const items: string[] = [];
    (d.checklist ?? []).forEach((sent, i) => {
      const item = oneLine(sent);
      if (item) items.push(item);
      else if (sent.trim()) said.push(LINE.unsavable(`checklist item ${i + 1}`));
    });
    if (items.length > CHECKLIST_MAX) said.push(LINE.checklistCount);
    items.forEach((item, i) => {
      if (item.length > CHECKLIST_ITEM_MAX) said.push(LINE.checklistItem(i + 1));
    });

    inputs.push({
      title,
      description: notes,
      dueDate,
      propertyId: property?.id ?? null,
      unitLabel,
      assignee,
      entryPermitted: d.entryPermitted === true && contractor !== null,
      checklist: items.map((item) => ({ title: item })),
      asSent: {
        title,
        notes,
        propertyId: d.propertyId?.trim() || null,
        unitLabel: givenUnit,
        wholeBuilding: d.wholeBuilding === true,
        assignee: d.assignee?.trim() || null,
        due: givenDue,
        entryPermitted: d.entryPermitted ?? null,
        checklist: items,
      },
    });
    for (const line of said) problems.add(index + 1, line, clip(title, 80));
  });

  return { inputs, problems: problems.list() };
}

// ---------------------------------------------------------------------------
// save_drafts: what comes back
// ---------------------------------------------------------------------------

export interface SavedDraft {
  id: string;
  /** The draft's own page. */
  link: string;
  title: string;
  /** "Zack Reading · Fri, Nov 27 · 933 Lafayette Ave · Unit 2": full names, so a wrong match shows. */
  summary: string;
  /** "Emails Zack", "Rob doesn't get job emails", or null when nobody outside hears. */
  onAdd: string | null;
}

export interface SaveDraftsSaved {
  saved: number;
  alreadySaved: false;
  tasksLink: string;
  drafts: SavedDraft[];
  message: string;
}

/**
 * The same save sent again: the ids and links of the tasks the first send
 * made, and that nothing was added. Nothing else. A partner may have added,
 * renamed, reassigned or dated them since, and Claude doesn't read tasks.
 */
export interface SaveDraftsReplayed {
  saved: number;
  alreadySaved: true;
  tasksLink: string;
  drafts: { id: string; link: string }[];
  message: string;
}

export interface SaveDraftsRefused {
  saved: 0;
  message: string;
  problems: DraftProblems[];
}

type SavedTask = Pick<Task, "id" | "title" | "dueDate" | "propertyId" | "unitLabel" | "assigneeUserId" | "assigneeContactId">;

const originOf = (appUrl: string) => new URL(appUrl).origin;

/**
 * The drafts a save just wrote, as Claude reports them. Every name is the
 * record's as the directory sends it (`facts` are the records the checks
 * passed a moment ago), so nothing here was read from a task a partner could
 * have changed, and nothing a contractor typed arrives uncleaned.
 */
export function describeSaved(tasks: readonly SavedTask[], facts: SaveFacts, viewer: Viewer, appUrl: string, today: Ymd): SavedDraft[] {
  const origin = originOf(appUrl);
  const people = peopleOf(facts);
  return tasks.map((t) => {
    const user = t.assigneeUserId === viewer.id ? viewer : facts.users.get(t.assigneeUserId ?? "");
    const contact = facts.contacts.get(t.assigneeContactId ?? "") ?? null;
    const property = facts.properties.get(t.propertyId ?? "");
    const day = t.dueDate ? toYmd(t.dueDate) : null;
    const parts = [
      user ? partnerName(user) : (contact?.name ?? "No one"),
      day ? dayWords(day, today) : "No date",
      property ? streetOf(property.address) : null,
      unitWords(t.unitLabel),
    ];
    return {
      id: t.id,
      link: `${origin}/tasks/${t.id}`,
      title: t.title,
      summary: parts.filter(Boolean).join(" · "),
      onAdd: draftEmailLine(draftContractor(contact ? { id: contact.id, fullName: contact.name, active: contact.active, portalAccount: contact.portalAccount } : null), people),
    };
  });
}

const draftsWord = (n: number) => (n === 1 ? "1 draft" : `${n} drafts`);

// ---------------------------------------------------------------------------
// Running a tool
// ---------------------------------------------------------------------------

/**
 * The task service's save (tasks/service.ts saveDrafts), in the partner's own
 * name: every draft or none. `saved` wrote them. `replay` is the same drafts
 * under the same batchKey again, `key-reused` other drafts under a used one,
 * `too-many` a partner whose waiting drafts are at their cap: none of the
 * three writes anything. `check` runs inside the transaction for a new save
 * that fits only, and throws to refuse it.
 */
export type SaveDrafts = (user: Viewer, batchKey: string, drafts: readonly DraftInput[], check: (tx: Tx) => Promise<void>) => Promise<SaveDraftsResult>;

export interface McpDeps {
  /** The bearer check: who the token stands for, or null (also null while the connector is off). */
  verify(request: Request, now: Date): Promise<VerifiedAccess | null>;
  /** The answer for a call `verify` turned away: 404 while the connector is off, otherwise the 401 that starts Claude's sign-in. */
  unauthorized(request: Request): Response;
  db: PrismaClient;
  save: SaveDrafts;
  /** The app's own address, for the links (getEnv().appUrl). Asked only once a save has gone through. */
  appUrl(): string;
  limits: { calls: RateLimiter; saves: RateLimiter };
  now(): Date;
  /** Told a scope and the error, never the request. */
  logError(scope: string, err: unknown): void;
}

/** A tool's answer: text for the model, and whether it is a refusal the model should act on. */
interface ToolAnswer {
  content: { type: "text"; text: string }[];
  isError: boolean;
}

const answer = (body: unknown, isError = false): ToolAnswer => ({ content: [{ type: "text", text: JSON.stringify(body) }], isError });

const refused = (message: string, problems: DraftProblems[] = []): ToolAnswer => answer({ saved: 0, message, problems } satisfies SaveDraftsRefused, true);

/** Thrown inside the save's transaction, so a new save with a problem writes nothing and a save sent twice is never judged again. */
class SaveStopped extends Error {
  constructor(readonly answer: ToolAnswer) {
    super("save stopped");
  }
}

const ARGS_DONT_FIT = "Nothing was saved. The arguments don't fit what save_drafts takes. Fix them and send every draft again.";
const NOTHING_SAVED = "Nothing was saved. Ask him what each problem says to ask, fix the rest, then send every draft again.";
/** A record changed between the checks and the write (a contractor archived that second). No word on which, or how. */
const DIRECTORY_CHANGED = `Nothing was saved. The directory changed while this was saving. Call ${GET_DIRECTORY} again, then send every draft again.`;
const KEY_REUSED = "This batchKey was already used for a different save. Send these drafts again with a new batchKey.";
const tooManyWaiting = (waiting: number) => `He already has ${waiting} drafts waiting in ${CONNECTOR_NAME}. Ask him to add or discard some, then save again.`;

/**
 * Counts given back: a save is counted against the hour's budget inside its
 * transaction, before its drafts are written, so one over the budget writes
 * nothing. When the write then fails (a record changed that second, the
 * transaction ran out of time) nothing was saved, and the app's limiter can
 * only count (rate-limit.ts). So the count is kept here, by the time it was
 * made, for that connection's next save, which takes it in place of a new
 * one. It is good while the limiter still holds it, an hour, so the limiter's
 * ten always cover the saves written and the counts still owed. Per limiter
 * and per connection, like the limiter's own counts.
 */
const givenBack = new WeakMap<RateLimiter, Map<string, number[]>>();

/** The counts given back that the limiter still holds, for every connection: one older than the hour is dropped, as the limiter drops its own. */
function countsOwed(saves: RateLimiter, now: number): Map<string, number[]> {
  const owed = givenBack.get(saves) ?? new Map<string, number[]>();
  givenBack.set(saves, owed);
  for (const [connectionId, list] of owed) {
    const live = list.filter((at) => at > now - HOUR_MS);
    if (live.length > 0) owed.set(connectionId, live);
    else owed.delete(connectionId);
  }
  return owed;
}

/** One save against a connection's budget: a count given back first, then the limiter's. `at` is when it was counted. */
function countSave(saves: RateLimiter, connectionId: string, now: number): { ok: true; at: number } | { ok: false; retryAfterMs: number } {
  const back = countsOwed(saves, now).get(connectionId)?.shift();
  if (back !== undefined) return { ok: true, at: back };
  const budget = saves.allow(connectionId, now);
  return budget.ok ? { ok: true, at: now } : budget;
}

/** A counted save that wrote nothing gets its count back (givenBack). */
function giveSaveBack(saves: RateLimiter, connectionId: string, at: number, now: number): void {
  const owed = countsOwed(saves, now);
  owed.set(connectionId, [...(owed.get(connectionId) ?? []), at]);
}

async function runSaveDrafts(args: unknown, access: VerifiedAccess, deps: McpDeps, now: Date): Promise<ToolAnswer> {
  // Size, shape, text and ids first: none of these reads a record or costs a save.
  const parsed = parseSaveArgs(args);
  if (!parsed.ok) return refused(ARGS_DONT_FIT, parsed.problems);
  const today = todayYmdEastern(now);
  const facts = await loadSaveFacts(deps.db, parsed.drafts, now);
  const { inputs, problems } = checkDrafts(parsed.drafts, facts, access.user, today);

  let result: SaveDraftsResult;
  // When this save was counted against the hour's budget, once it has been. (Set inside the callback, which the
  // compiler can't follow, so the type is stated in full.)
  let counted = null as number | null;
  try {
    result = await deps.save(access.user, parsed.batchKey, inputs, async () => {
      if (problems.length > 0) throw new SaveStopped(refused(NOTHING_SAVED, problems));
      // Counted only here: a save that is new, fits and passed every check. A refusal or a repeat costs nothing.
      const budget = countSave(deps.limits.saves, access.connection.id, now.getTime());
      if (!budget.ok) {
        const minutes = Math.max(1, Math.ceil(budget.retryAfterMs / MINUTE_MS));
        throw new SaveStopped(refused(`Nothing was saved. This connection has saved ${SAVES_PER_HOUR} times in the last hour. Try again in ${minutes === 1 ? "1 minute" : `${minutes} minutes`}.`));
      }
      counted = budget.at;
    });
  } catch (err) {
    // Counted, and then the write failed: nothing was saved, so it costs nothing either.
    if (counted !== null) giveSaveBack(deps.limits.saves, access.connection.id, counted, now.getTime());
    if (err instanceof SaveStopped) return err.answer;
    if (err instanceof TaskRuleError) return refused(DIRECTORY_CHANGED);
    throw err;
  }

  if (result.kind === "key-reused") return refused(KEY_REUSED);
  if (result.kind === "too-many") return refused(tooManyWaiting(result.waiting));

  const origin = originOf(deps.appUrl());
  const count = result.tasks.length;
  if (result.kind === "replay") {
    return answer({
      saved: count,
      alreadySaved: true,
      tasksLink: `${origin}/tasks`,
      drafts: result.tasks.map((t) => ({ id: t.id, link: `${origin}/tasks/${t.id}` })),
      message: `This batchKey already saved ${count === 1 ? "this draft" : `these ${count} drafts`}. Nothing new was saved.`,
    } satisfies SaveDraftsReplayed);
  }
  return answer({
    saved: count,
    alreadySaved: false,
    tasksLink: `${origin}/tasks`,
    drafts: describeSaved(result.tasks, facts, access.user, deps.appUrl(), today),
    message: `Saved ${draftsWord(count)}. ${count === 1 ? "It waits" : "They wait"} in the Tasks list until he taps Add.`,
  } satisfies SaveDraftsSaved);
}

/** Runs one tool. A failure of ours is logged and told to Claude in words it can pass on; nothing about the call is logged. */
async function callTool(name: string, args: unknown, access: VerifiedAccess, deps: McpDeps, now: Date): Promise<ToolAnswer> {
  try {
    if (name === GET_DIRECTORY) return answer(await getDirectory(deps.db, access.user, now));
    return await runSaveDrafts(args, access, deps, now);
  } catch (err) {
    deps.logError(`claude:${name}`, err);
    return name === GET_DIRECTORY
      ? answer({ message: "Couldn't read the directory. Try again in a minute." }, true)
      : refused("Couldn't save the drafts. Try again in a minute with the same batchKey.");
  }
}

// ---------------------------------------------------------------------------
// The protocol
// ---------------------------------------------------------------------------

/** Versions that open with `initialize`, newest first. */
export const HANDSHAKE_VERSIONS: readonly string[] = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
/** Versions that carry everything on each request. */
export const PER_REQUEST_VERSIONS: readonly string[] = ["2026-07-28"];
export const SUPPORTED_VERSIONS: readonly string[] = [...PER_REQUEST_VERSIONS, ...HANDSHAKE_VERSIONS];

const META_VERSION = "io.modelcontextprotocol/protocolVersion";
const META_CAPABILITIES = "io.modelcontextprotocol/clientCapabilities";
const META_SERVER = "io.modelcontextprotocol/serverInfo";

/** JSON-RPC's own codes, and the three the 2026-07-28 revision defines. */
export const RPC = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603,
  headerMismatch: -32020,
  unsupportedVersion: -32022,
} as const;

/** How long a client may keep tools/list and server/discover: short, so a deploy's new wording shows within minutes. */
const LIST_TTL_MS = 300_000;

export const SERVER_INFO = { name: CONNECTOR_NAME, title: CONNECTOR_NAME, version: CONNECTOR_VERSION } as const;
const CAPABILITIES = { tools: { listChanged: false } } as const;

const NO_STORE = { "Cache-Control": "no-store" } as const;

type RpcId = string | number | null;

function rpcResult(id: RpcId, result: unknown): Response {
  return Response.json({ jsonrpc: "2.0", id, result }, { status: 200, headers: NO_STORE });
}

function rpcError(status: number, id: RpcId, code: number, message: string, data?: unknown, headers: Record<string, string> = {}): Response {
  return Response.json({ jsonrpc: "2.0", id, error: { code, message, ...(data === undefined ? {} : { data }) } }, { status, headers: { ...NO_STORE, ...headers } });
}

/** A header value sent as "=?base64?...?=" (2026-07-28, for a name that isn't plain ASCII), decoded. */
function headerText(raw: string | null): string | null {
  if (raw === null) return null;
  const m = /^=\?base64\?([A-Za-z0-9+/=]*)\?=$/.exec(raw.trim());
  return m ? Buffer.from(m[1], "base64").toString("utf8") : raw.trim();
}

/** The request itself, read: one JSON-RPC message, or the answer that turns it away. */
async function readMessage(request: Request): Promise<Record<string, unknown> | Response> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > BODY_MAX) return rpcError(413, null, 413, "That request is too large. Send fewer drafts in one call.");
  const text = await request.text();
  if (text.length > BODY_MAX) return rpcError(413, null, 413, "That request is too large. Send fewer drafts in one call.");
  let message: unknown;
  try {
    message = JSON.parse(text);
  } catch {
    return rpcError(400, null, RPC.parse, "Parse error: the body isn't JSON.");
  }
  if (Array.isArray(message)) return rpcError(400, null, RPC.invalidRequest, "Invalid request: send one message per request, not a batch.");
  if (!isRecord(message) || message.jsonrpc !== "2.0") return rpcError(400, null, RPC.invalidRequest, "Invalid request: not a JSON-RPC 2.0 message.");
  return message;
}

/**
 * /api/mcp/<key>, whole: the bearer check, the per-connection limit, then one
 * JSON-RPC message. GET and DELETE answer 405 (there is no stream to open and
 * no session to end), and count against the limit like any call; a
 * notification answers 202.
 */
export async function handleMcp(request: Request, deps: McpDeps): Promise<Response> {
  const now = deps.now();
  try {
    const access = await deps.verify(request, now);
    if (!access) return deps.unauthorized(request);

    const budget = deps.limits.calls.allow(access.connection.id, now.getTime());
    deps.limits.calls.prune(now.getTime());
    deps.limits.saves.prune(now.getTime());
    if (!budget.ok) {
      return rpcError(429, null, 429, "Too many calls. Wait a minute, then try again.", undefined, { "Retry-After": String(Math.max(1, Math.ceil(budget.retryAfterMs / 1000))) });
    }
    // -32000 with a null id is what the reference server sends with its 405.
    if (request.method !== "POST") return rpcError(405, null, -32000, "Method not allowed. Send each message as a POST.", undefined, { Allow: "POST" });

    const message = await readMessage(request);
    if (message instanceof Response) return message;

    if (typeof message.method !== "string") {
      // A client's answer to a request of ours. We send none, so there is nothing to match it to; taken and dropped.
      if ("result" in message || "error" in message) return new Response(null, { status: 202, headers: NO_STORE });
      return rpcError(400, null, RPC.invalidRequest, "Invalid request: no method.");
    }
    // A notification (notifications/initialized, notifications/cancelled): nothing to answer.
    if (!("id" in message)) return new Response(null, { status: 202, headers: NO_STORE });
    const id = message.id;
    if (typeof id !== "string" && typeof id !== "number") return rpcError(400, null, RPC.invalidRequest, "Invalid request: the id must be a string or a number.");

    return await answerRequest(request, { id, method: message.method, params: isRecord(message.params) ? message.params : {} }, access, deps, now);
  } catch (err) {
    deps.logError("claude:mcp", err);
    return rpcError(500, null, RPC.internal, "Internal error. Try again in a minute.");
  }
}

interface RpcRequest {
  id: string | number;
  method: string;
  params: Record<string, unknown>;
}

async function answerRequest(request: Request, rpc: RpcRequest, access: VerifiedAccess, deps: McpDeps, now: Date): Promise<Response> {
  const { id, method, params } = rpc;
  const header = request.headers.get("mcp-protocol-version")?.trim() || null;
  const meta = isRecord(params._meta) ? params._meta : {};
  const unsupported = (requested: unknown) =>
    rpcError(400, id, RPC.unsupportedVersion, "Unsupported protocol version", { supported: SUPPORTED_VERSIONS, requested: typeof requested === "string" ? requested.slice(0, 40) : null });

  // The handshake opens the older shape, whatever its headers say. One that also names a per-request version in
  // `_meta` is the newer shape, which has no handshake, and is answered below as a method it doesn't have.
  if (method === "initialize" && !(META_VERSION in meta)) {
    const asked = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
    return rpcResult(id, {
      protocolVersion: HANDSHAKE_VERSIONS.includes(asked) ? asked : HANDSHAKE_VERSIONS[0],
      capabilities: CAPABILITIES,
      serverInfo: SERVER_INFO,
      instructions: SERVER_INSTRUCTIONS,
    });
  }

  const perRequest = META_VERSION in meta || (header !== null && PER_REQUEST_VERSIONS.includes(header));
  if (perRequest) {
    const version = meta[META_VERSION];
    if (typeof version !== "string") return rpcError(400, id, RPC.invalidParams, `Invalid params: _meta needs ${META_VERSION}.`);
    if (header === null) return rpcError(400, id, RPC.headerMismatch, "Header mismatch: the MCP-Protocol-Version header is missing.");
    if (header !== version) return rpcError(400, id, RPC.headerMismatch, "Header mismatch: MCP-Protocol-Version doesn't match the version in _meta.");
    if (!PER_REQUEST_VERSIONS.includes(version)) return unsupported(version);
    if (!isRecord(meta[META_CAPABILITIES])) return rpcError(400, id, RPC.invalidParams, `Invalid params: _meta needs ${META_CAPABILITIES}.`);
    if (request.headers.get("mcp-method")?.trim() !== method) return rpcError(400, id, RPC.headerMismatch, "Header mismatch: Mcp-Method is missing or doesn't match the method.");
    if (method === "tools/call" && headerText(request.headers.get("mcp-name")) !== params.name) {
      return rpcError(400, id, RPC.headerMismatch, "Header mismatch: Mcp-Name is missing or doesn't match the tool's name.");
    }
  } else if (header !== null && !HANDSHAKE_VERSIONS.includes(header)) {
    return unsupported(header);
  }

  /** The newer shape marks every result complete and names the server on it. */
  const result = (body: Record<string, unknown>, cacheable = false) =>
    rpcResult(id, perRequest ? { resultType: "complete", ...body, ...(cacheable ? { ttlMs: LIST_TTL_MS, cacheScope: "private" } : {}), _meta: { [META_SERVER]: SERVER_INFO } } : body);

  switch (method) {
    case "server/discover":
      if (!perRequest) break;
      return result({ supportedVersions: PER_REQUEST_VERSIONS, capabilities: CAPABILITIES, instructions: SERVER_INSTRUCTIONS }, true);
    case "ping":
      if (perRequest) break;
      return result({});
    case "tools/list":
      return result({ tools: TOOLS }, true);
    case "tools/call": {
      const name = params.name;
      if (typeof name !== "string" || !TOOLS.some((t) => t.name === name)) {
        return rpcError(200, id, RPC.invalidParams, `Unknown tool: ${clip(typeof name === "string" ? name : "", 64) ?? "none named"}`);
      }
      if (params.arguments !== undefined && !isRecord(params.arguments)) return rpcError(200, id, RPC.invalidParams, "Invalid params: arguments must be an object.");
      return result({ ...(await callTool(name, params.arguments ?? {}, access, deps, now)) });
    }
  }
  // 2026-07-28 answers an unknown method with 404; the handshake versions answer inside a 200.
  return rpcError(perRequest ? 404 : 200, id, RPC.methodNotFound, `Method not found: ${clip(method, 64) ?? ""}`);
}
