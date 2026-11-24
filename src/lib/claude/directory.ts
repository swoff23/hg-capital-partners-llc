import type { Prisma, PrismaClient } from "@prisma/client";
import { TRADE_LINKS, tradeNames } from "@/lib/contractors/trades";
import { HG_TIME_ZONE, todayYmdEastern, ymdToDate, type Ymd } from "@/lib/dates";
import { compareStreet } from "@/lib/normalize";
import { JOB_EMAIL_SELECT, jobEmailState } from "@/lib/portal/job-emails";
import { isHouseMeterRow, parseUnits, type PropertyUnit } from "@/lib/property-types";
import { liveRecord } from "@/lib/record-scope";
import { assigneeKey, listedContactsWhere } from "@/lib/tasks/assignee-people";
import { UNIT_MAX } from "@/lib/tasks/limits";
import { tenantUnit } from "@/lib/tasks/lockbox";
import { livingLease } from "@/lib/tenants/status";

/**
 * get_directory (docs/specs/tasks-from-claude.md, section 5): everything
 * Claude may read, in one answer. Today in Buffalo, the partner's own name,
 * the live properties with each unit's tenants, and the partners and live
 * contractors. The scope is the pickers' own: properties as propertyOptions()
 * offers them (picker-options.ts) and people as assigneeOptions() does
 * (tasks/assignee-options.ts), so nothing archived is here. One person the
 * picker offers is left out: someone who signed up through the shared link
 * and whom no partner has kept yet (`Contact.needsReview`). In the app a
 * partner picks that row himself; here Claude matches a name by sound.
 *
 * `DIRECTORY_PROPERTIES` and `DIRECTORY_CONTRACTORS` are that scope, and
 * save_drafts reads the records a draft names through the same two (tools.ts
 * loadSaveFacts), so a save takes exactly what this lists and nothing else.
 *
 * What it must never hold: lockbox codes, money, loans, task text, notes or
 * comments. Each query below selects only the columns it sends, and a unit is
 * read for its id and label alone (directory.test.ts pins both). Contractors
 * type their own name, phone and email, so every string is cleaned of what
 * can't be seen and cut to a length and to one line before it leaves (`clip`),
 * a phone goes without the note typed after it, and an email goes only when
 * it is a plain address.
 *
 * No `server-only` and no Next: the queries take the client, so the database
 * test runs them (tools.pg.test.ts).
 */

type Reader = Pick<PrismaClient, "property" | "lease" | "user" | "contact"> | Pick<Prisma.TransactionClient, "property" | "lease" | "user" | "contact">;

/** The longest each string runs, and the most of a list. */
export const CAP = { name: 80, address: 160, unit: UNIT_MAX, trade: 40, trades: 12, phone: 40, email: 160, tenants: 10 } as const;

/**
 * What a reader can't see and a model still reads: format characters
 * (zero-width, direction marks, the tag block), private-use and unassigned
 * code points, lone surrogates, and everything Unicode marks as ignorable
 * (Default_Ignorable_Code_Point: the variation selectors and the grapheme
 * joiner, which are marks, and the Hangul fillers, which are letters).
 */
const UNSEEN = /[\p{Cf}\p{Co}\p{Cs}\p{Cn}\p{Default_Ignorable_Code_Point}]+/gu;

/**
 * Two symbols that draw as nothing though Unicode counts them as visible: the
 * Braille blank (U+2800) and the object replacement character (U+FFFC).
 */
const BLANK = /[\u2800\uFFFC]+/g;

/**
 * Text without what nobody can see: the unseen characters are dropped and a
 * blank-looking symbol becomes a space, so words either side of one stay
 * apart and text made only of these reads as the nothing it is once trimmed.
 * The one cleaner both tools use: `clip` for what comes from a record, and
 * save_drafts for the words of a draft (tools.ts), so what is stored and what
 * is sent is the text a person reads.
 */
export function seenText(text: string): string {
  return text.replace(UNSEEN, "").replace(BLANK, " ");
}

/**
 * A string as either tool sends it: compatibility forms folded to the plain
 * ones (NFKC, so full-width letters read as letters), nothing a reader can't
 * see, one line, cut to `max`. Null for nothing left. Every string that comes
 * from a record goes through here on its way to Claude: names, trades,
 * phones, emails, addresses, unit labels, tenant names, and the same names
 * inside the lines save_drafts writes.
 */
export function clip(value: string | null | undefined, max: number): string | null {
  const line = seenText(
    (value ?? "")
      // A fraction typed as one character keeps a space from the number before it: "933½" folds to "933 1/2", not "9331/2".
      .replace(/(\d)(?=[\u00BC-\u00BE\u2150-\u215E])/g, "$1 ")
      .normalize("NFKC")
      .replace(/\u2044/g, "/")
      // Control characters become spaces, so the words either side stay apart.
      .replace(/\p{Cc}+/gu, " "),
  )
    // Once more, so the result is stable: a hidden character between a letter and its accent kept them apart the first time.
    .normalize("NFKC")
    // \s folds every run of whitespace, line and paragraph separators included.
    .replace(/\s+/g, " ")
    .trim();
  if (!line) return null;
  // By code point, so a cut never leaves half a character.
  return line.length > max ? [...line].slice(0, max).join("").trim() : line;
}

/**
 * A phone as the directory sends it: the number, without the note a person
 * can type after it ("716-555-0100 (new cell, use this one)" is stored whole,
 * contractors/contact-fields.ts readPhone). The number ends at its last digit
 * before the first letter or #.
 */
export function phoneNumber(raw: string | null | undefined): string | null {
  const text = clip(raw, 200) ?? "";
  const cut = text.search(/[\p{L}#]/u);
  const head = cut === -1 ? text : text.slice(0, cut);
  const number = head.slice(0, head.search(/\d\D*$/) + 1);
  return clip(number, CAP.phone);
}

/** A plain email address: the usual characters, a name of 64 or fewer, one @. */
const PLAIN_EMAIL = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;

/** An email as the directory sends it, or null for one that reads as anything but an address. */
export function plainEmail(raw: string | null | undefined): string | null {
  const email = (raw ?? "").trim();
  return email.length <= CAP.email && PLAIN_EMAIL.test(email) ? email : null;
}

// ---------------------------------------------------------------------------
// Who lives where
// ---------------------------------------------------------------------------

/** A lease as the directory reads it: its home, its dates, its tenants' names. Never the deposit or the rent. */
export const LEASE_SELECT = {
  propertyId: true,
  unitId: true,
  movesIn: true,
  movesOut: true,
  tenants: { select: { tenant: { select: { fullName: true } } }, orderBy: [{ primary: "desc" }, { position: "asc" }] },
} satisfies Prisma.LeaseSelect;

export type LeaseRow = Prisma.LeaseGetPayload<{ select: typeof LEASE_SELECT }>;

/** These properties' leases that aren't over: someone lives there, or is about to. */
export function openLeasesWhere(propertyIds: readonly string[], today: Ymd): Prisma.LeaseWhereInput {
  return { propertyId: { in: [...propertyIds] }, OR: [{ movesOut: null }, { movesOut: { gt: ymdToDate(today) ?? undefined } }] };
}

/**
 * The household living in a job's home today: its tenants' names, or null
 * when the home is vacant or no one home can be named (a building with
 * several units and none picked). `leases` are that property's. The rule is
 * the task page's own (tenants/living.ts readTaskHome): the unit by its label,
 * or the property's one rentable unit, then the lease living there.
 */
export function livingTenants(units: readonly PropertyUnit[], leases: readonly LeaseRow[], unitLabel: string | null, today: Ymd): string[] | null {
  const home = tenantUnit(units, unitLabel);
  if (!home) return null;
  const lease = livingLease(leases, home.unitId, today);
  return lease ? lease.tenants.map((t) => t.tenant.fullName) : null;
}

/**
 * A property's unit labels as Claude is offered them, and the only ones a
 * save takes (tools.ts checkDrafts): rentable units, trimmed, once each.
 * House-meter rows aren't a home. Neither is a label with nothing to read
 * once it is cleaned (`clip`): it is left out, never sent as it is stored.
 * The labels come back as the property spells them, since a task names its
 * unit by that; `clip` each on its way to Claude.
 */
export function offeredUnitLabels(units: readonly PropertyUnit[]): string[] {
  const labels = units.filter((u) => !isHouseMeterRow(u)).map((u) => u.label?.trim() ?? "");
  return [...new Set(labels.filter((label) => clip(label, CAP.unit) !== null))];
}

// ---------------------------------------------------------------------------
// Whom and what the directory lists
// ---------------------------------------------------------------------------

/** The properties Claude may read and a draft may name: the pickers' own, so nothing archived. */
export const DIRECTORY_PROPERTIES = liveRecord satisfies Prisma.PropertyWhereInput;

/**
 * The contractors Claude may read and a draft may name: the assignee picker's
 * people, less anyone archived and anyone who came through the shared sign-up
 * link and hasn't been kept by a partner.
 */
export const DIRECTORY_CONTRACTORS = { ...listedContactsWhere, ...liveRecord, needsReview: false } satisfies Prisma.ContactWhereInput;

/** A contractor's name as the directory sends it. Null for a name with nothing left to read: that person isn't listed. */
export function listedName(fullName: string | null | undefined): string | null {
  return clip(fullName, CAP.name);
}

// ---------------------------------------------------------------------------
// The answer
// ---------------------------------------------------------------------------

export interface DirectoryUnit {
  label: string;
  hasTenants: boolean;
  tenants: string[];
}

export interface DirectoryProperty {
  id: string;
  address: string;
  units: DirectoryUnit[];
  /** Only on a property with no units, which is one home. */
  hasTenants?: boolean;
  tenants?: string[];
}

export interface DirectoryPartner {
  /** "u:<userId>", the assignee picker's own key. */
  id: string;
  name: string;
  email: string | null;
}

export interface DirectoryContractor {
  /** "c:<contactId>". */
  id: string;
  name: string;
  trades: string[];
  phone: string | null;
  email: string | null;
  /** Whether adding a draft for them sends the job email (portal/job-emails.ts jobEmailState). */
  getsJobEmails: boolean;
}

export interface Directory {
  today: { date: Ymd; weekday: string; timeZone: string };
  you: { id: string; name: string };
  properties: DirectoryProperty[];
  people: { partners: DirectoryPartner[]; contractors: DirectoryContractor[] };
}

const CONTRACTOR_SELECT = {
  id: true,
  fullName: true,
  phone: true,
  email: true,
  active: true,
  tradeLinks: TRADE_LINKS,
  portalAccount: { select: JOB_EMAIL_SELECT },
} satisfies Prisma.ContactSelect;

export interface DirectoryRows {
  properties: { id: string; address: string; units: unknown }[];
  leases: LeaseRow[];
  users: { id: string; name: string | null; email: string }[];
  contractors: Prisma.ContactGetPayload<{ select: typeof CONTRACTOR_SELECT }>[];
}

/** The rows behind the directory: four reads, each naming its columns. */
export async function readDirectoryRows(db: Reader, now: Date): Promise<DirectoryRows> {
  const [properties, users, contractors] = await Promise.all([
    db.property.findMany({ where: DIRECTORY_PROPERTIES, select: { id: true, address: true, units: true } }),
    db.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, email: true } }),
    db.contact.findMany({ where: DIRECTORY_CONTRACTORS, orderBy: { fullName: "asc" }, select: CONTRACTOR_SELECT }),
  ]);
  const leases =
    properties.length > 0
      ? await db.lease.findMany({ where: openLeasesWhere(properties.map((p) => p.id), todayYmdEastern(now)), select: LEASE_SELECT })
      : [];
  return { properties, leases, users, contractors };
}

const weekdayOf = (day: Ymd) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long" });

/** A partner's name as the directory and a draft's summary write it: their name, or their email until they have one. */
export function partnerName(user: { name: string | null; email: string }): string {
  return clip(user.name, CAP.name) ?? clip(user.email, CAP.email) ?? "";
}

/** The rows as Claude gets them. Pure; see directory.test.ts. */
export function shapeDirectory(rows: DirectoryRows, viewer: { id: string; name: string | null; email: string }, now: Date): Directory {
  const today = todayYmdEastern(now);
  const leasesOf = new Map<string, LeaseRow[]>();
  for (const lease of rows.leases) leasesOf.set(lease.propertyId, [...(leasesOf.get(lease.propertyId) ?? []), lease]);

  const properties = [...rows.properties]
    .sort((a, b) => compareStreet(a.address, b.address) || a.id.localeCompare(b.id))
    .map((p): DirectoryProperty => {
      const units = parseUnits(p.units);
      const leases = leasesOf.get(p.id) ?? [];
      const home = (label: string | null) => {
        const names = livingTenants(units, leases, label, today);
        const tenants = (names ?? []).flatMap((n) => clip(n, CAP.name) ?? []).slice(0, CAP.tenants);
        return { hasTenants: names !== null, tenants };
      };
      const labels = offeredUnitLabels(units);
      return {
        id: p.id,
        address: clip(p.address, CAP.address) ?? "",
        // Every offered label has something to read, so nothing is ever sent as it is stored.
        units: labels.flatMap((label) => {
          const shown = clip(label, CAP.unit);
          return shown ? [{ label: shown, ...home(label) }] : [];
        }),
        ...(labels.length === 0 ? home(null) : {}),
      };
    });

  const partners = rows.users.map((u): DirectoryPartner => ({ id: assigneeKey({ userId: u.id })!, name: partnerName(u), email: plainEmail(u.email) }));
  const contractors = rows.contractors.flatMap((c): DirectoryContractor[] => {
    const name = listedName(c.fullName);
    if (!name) return [];
    return [
      {
        id: assigneeKey({ contactId: c.id })!,
        name,
        trades: tradeNames(c.tradeLinks)
          .flatMap((t) => clip(t, CAP.trade) ?? [])
          .slice(0, CAP.trades),
        phone: phoneNumber(c.phone),
        email: plainEmail(c.email),
        getsJobEmails: jobEmailState(c.portalAccount, c.active) === "on",
      },
    ];
  });

  return {
    today: { date: today, weekday: weekdayOf(today), timeZone: HG_TIME_ZONE },
    you: { id: assigneeKey({ userId: viewer.id })!, name: partnerName(viewer) },
    properties,
    people: { partners, contractors },
  };
}

/** get_directory's answer for one partner. */
export async function getDirectory(db: Reader, viewer: { id: string; name: string | null; email: string }, now: Date = new Date()): Promise<Directory> {
  return shapeDirectory(await readDirectoryRows(db, now), viewer, now);
}
