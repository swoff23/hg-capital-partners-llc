/**
 * Tenants and leases from Connor's checked review file (docs/specs/tenants.md
 * section 10). One-time, idempotent, and a dry run unless --write:
 *
 *   npx tsx scripts/migrate/04-tenants.ts                  # dry run: what it would create, and every problem
 *   npx tsx scripts/migrate/04-tenants.ts --write          # creates them, with the PDFs on private Blob
 *   npx tsx scripts/migrate/04-tenants.ts --write --skip-files
 *   npx tsx scripts/migrate/04-tenants.ts --dir /path/to/_private/tenants
 *
 * The review file is `review.csv` in the folder: one row per person per lease,
 * built from the Baselane export and the signed leases, then checked by
 * Connor. Columns (header row required, any order):
 *
 *   lease          a key grouping the people of one lease ("647-front-2025")
 *   property       the address as the app has it ("647 Prospect Ave")
 *   unit           the unit's label ("Front"); blank for a house with no units
 *   primary        "yes" on the primary's row (else the lease's first row)
 *   name, phone, email, emergency_name, emergency_phone
 *   moves_in, moves_out, deposit, lease_notes        once per lease (repeats must agree)
 *   term_starts, term_ends, rent, subsidy, subsidy_from, lease_pdf
 *                  a signed term; rows of one lease may each carry one (deduped by term_starts)
 *   flags          Connor's review column; ignored
 *
 * Every lease is checked before anything is written: with any problem, nothing
 * is. A lease already in the app (same property, unit and move-in) is skipped,
 * and a person already in the app (same name and phone) is reused, so a second
 * run adds nothing. It writes through src/lib/tenants/core.ts, the rules the
 * app keeps, with `source: IMPORT`. Production only with Connor's go-ahead:
 * point DATABASE_URL at it for that one run.
 */
import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { prisma } from "../../src/lib/db";
import { getEnv } from "../../src/lib/env";
import { toYmd } from "../../src/lib/dates";
import { addressKey, normalizeAddress } from "../../src/lib/normalize";
import { parseUnits, withUnitIds } from "../../src/lib/property-types";
import { readPhone } from "../../src/lib/contractors/contact-fields";
import { addTerm, createLease, ensureUnitIds, rentableUnits, type TenantPick } from "../../src/lib/tenants/core";
import { readStay, readTenant, readTerm } from "../../src/lib/tenants/fields";
import { blobUploader, localUploader, type Uploader } from "../asana/_import-lib";
import { PRIVATE_DIR } from "./_lib";

type Row = Record<string, string>;
const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const SKIP_FILES = args.includes("--skip-files");
const DIR = args.includes("--dir") ? path.resolve(args[args.indexOf("--dir") + 1]) : path.join(PRIVATE_DIR, "tenants");

const LEASE_FIELDS = ["moves_in", "moves_out", "deposit", "lease_notes"] as const;

type Planned = {
  key: string;
  propertyId: string;
  address: string;
  unitLabel: string | null;
  people: { pick: TenantPick; name: string; primary: boolean }[];
  lease: { movesIn: string | null; movesOut: string | null; deposit: string; notes: string };
  terms: { input: Record<string, string>; pdf: string | null }[];
};

const problems: string[] = [];
const say = (s: string) => console.log(s);

function cell(r: Row, k: string): string {
  return (r[k] ?? "").trim();
}

async function main() {
  const file = path.join(DIR, "review.csv");
  if (!fs.existsSync(file)) {
    say(`No review file at ${file}. Put review.csv there (or pass --dir), then run this again.`);
    process.exitCode = 1;
    return;
  }
  const rows = parse(fs.readFileSync(file), { columns: (h: string[]) => h.map((c) => c.trim().toLowerCase()), skip_empty_lines: true, trim: true, bom: true }) as Row[];
  say(`${rows.length} rows in ${file}${WRITE ? "" : " (dry run)"}`);

  const properties = await prisma.property.findMany({ select: { id: true, address: true, units: true } });
  const byKey = new Map<string, Row[]>();
  for (const [i, r] of rows.entries()) {
    const key = cell(r, "lease");
    if (!key) {
      problems.push(`Row ${i + 2}: no lease key.`);
      continue;
    }
    byKey.set(key, [...(byKey.get(key) ?? []), { ...r, __row: String(i + 2) }]);
  }

  // People already in the app, and those this run creates, by name and number.
  const existing = await prisma.tenant.findMany({ select: { id: true, fullName: true, phoneE164: true } });
  const known = new Map(existing.filter((t) => t.phoneE164).map((t) => [`${t.fullName.toLowerCase()}|${t.phoneE164}`, t.id]));

  const plan: Planned[] = [];
  for (const [key, group] of byKey) {
    const where = `Lease ${key} (rows ${group.map((r) => r.__row).join(", ")})`;
    const address = cell(group[0], "property");
    const matches = properties.filter((p) => normalizeAddress(p.address) === normalizeAddress(address) || addressKey(p.address) === addressKey(address));
    if (matches.length !== 1) {
      problems.push(`${where}: ${matches.length ? "more than one property matches" : "no property matches"} "${address}".`);
      continue;
    }
    const prop = matches[0];
    const units = rentableUnits(withUnitIds(parseUnits(prop.units)));
    const unitText = cell(group[0], "unit");
    let unitLabel: string | null = null;
    if (units.length) {
      const unit = units.find((u) => (u.label ?? "").trim().toLowerCase() === unitText.toLowerCase());
      if (!unit) {
        problems.push(`${where}: "${unitText}" isn't a unit at ${prop.address} (${units.map((u) => u.label).join(", ")}).`);
        continue;
      }
      unitLabel = unit.label?.trim() ?? null;
    } else if (unitText) {
      problems.push(`${where}: ${prop.address} has no units, so leave unit blank.`);
      continue;
    }

    // Once-per-lease fields must agree wherever they're filled in.
    const lease: Record<string, string> = {};
    for (const f of LEASE_FIELDS) {
      const values = [...new Set(group.map((r) => cell(r, f)).filter(Boolean))];
      if (values.length > 1) problems.push(`${where}: ${f} differs between rows (${values.join(" / ")}).`);
      lease[f] = values[0] ?? "";
    }
    const stay = readStay({ movesIn: lease.moves_in, movesOut: lease.moves_out });
    if (!stay.ok) problems.push(`${where}: ${Object.values(stay.problems).join(" ")}`);

    const primaries = group.filter((r) => /^y(es)?$/i.test(cell(r, "primary")));
    if (primaries.length > 1) problems.push(`${where}: more than one primary.`);
    const people: Planned["people"] = [];
    for (const r of group) {
      const input = { fullName: cell(r, "name"), phone: cell(r, "phone"), email: cell(r, "email"), emergencyName: cell(r, "emergency_name"), emergencyPhone: cell(r, "emergency_phone") };
      const read = readTenant(input, "new");
      if (!read.ok) {
        problems.push(`Row ${r.__row}: ${Object.values(read.problems).join(" ")}`);
        continue;
      }
      const e164 = readPhone(input.phone)?.phoneE164;
      const id = e164 ? known.get(`${read.data.fullName!.toLowerCase()}|${e164}`) : undefined;
      people.push({ pick: id ? { tenantId: id } : { new: input }, name: read.data.fullName!, primary: primaries.length ? primaries[0] === r : people.length === 0 });
    }

    const terms: Planned["terms"] = [];
    const seen = new Set<string>();
    for (const r of group) {
      const starts = cell(r, "term_starts");
      if (!starts || seen.has(starts)) continue;
      seen.add(starts);
      const input = { startsOn: starts, endsOn: cell(r, "term_ends"), rent: cell(r, "rent"), subsidy: cell(r, "subsidy"), subsidyFrom: cell(r, "subsidy_from") };
      const read = readTerm(input);
      if (!read.ok) problems.push(`Row ${r.__row}: ${Object.values(read.problems).join(" ")}`);
      const pdf = cell(r, "lease_pdf") || null;
      if (pdf && !fs.existsSync(path.join(DIR, pdf))) problems.push(`Row ${r.__row}: ${pdf} isn't in ${DIR}.`);
      terms.push({ input, pdf });
    }
    terms.sort((a, b) => (toYmd(a.input.startsOn) ?? "").localeCompare(toYmd(b.input.startsOn) ?? ""));

    plan.push({
      key,
      propertyId: prop.id,
      address: prop.address,
      unitLabel,
      people,
      lease: { movesIn: stay.ok ? (stay.data.movesIn ?? null) : null, movesOut: stay.ok ? (stay.data.movesOut ?? null) : null, deposit: lease.deposit, notes: lease.lease_notes },
      terms,
    });
  }

  // Leases already in the app: same property, unit and move-in.
  const already = await prisma.lease.findMany({ select: { propertyId: true, unitLabel: true, movesIn: true } });
  const isThere = (p: Planned) =>
    already.some((l) => l.propertyId === p.propertyId && (l.unitLabel ?? "").toLowerCase() === (p.unitLabel ?? "").toLowerCase() && toYmd(l.movesIn) === p.lease.movesIn);
  const todo = plan.filter((p) => !isThere(p));

  say(`\n${plan.length} leases read; ${plan.length - todo.length} already in the app; ${todo.length} to create.`);
  for (const p of todo) {
    const who = p.people.map((x) => `${x.name}${x.primary ? " (primary)" : ""}${"tenantId" in x.pick ? " [existing]" : ""}`).join(", ");
    say(`  ${p.address}${p.unitLabel ? ` · ${p.unitLabel}` : ""}: ${who}; in ${p.lease.movesIn ?? "now"}${p.lease.movesOut ? `, out ${p.lease.movesOut}` : ""}; ${p.terms.length} term(s)`);
  }
  if (problems.length) {
    say(`\n${problems.length} problem(s). Nothing was written. Fix them in review.csv and run again:`);
    for (const x of problems) say(`  - ${x}`);
    process.exitCode = 1;
    return;
  }
  if (!WRITE) {
    say("\nDry run: nothing was written. Run with --write to create them.");
    return;
  }

  const uploader: Uploader | null = SKIP_FILES ? null : getEnv().BLOB_READ_WRITE_TOKEN ? blobUploader(getEnv().BLOB_READ_WRITE_TOKEN!) : localUploader(path.join(DIR, "_uploaded"));
  if (uploader) say(`Files go to ${uploader.label}.`);
  for (const p of todo) {
    // Units saved before ids existed get lasting ids first, so the lease can point at one.
    const ensured = await prisma.$transaction((tx) => ensureUnitIds(tx, p.propertyId));
    const unit = p.unitLabel ? rentableUnits(ensured!.units).find((u) => (u.label ?? "").trim().toLowerCase() === p.unitLabel!.toLowerCase()) : null;
    const primary = Math.max(0, p.people.findIndex((x) => x.primary));
    const [first, ...rest] = p.terms;
    const { id } = await createLease(
      prisma,
      {
        propertyId: p.propertyId,
        unitId: unit?.id ?? null,
        tenants: p.people.map((x) => x.pick),
        primary,
        movesIn: p.lease.movesIn,
        movesOut: p.lease.movesOut,
        deposit: p.lease.deposit,
        notes: p.lease.notes,
        term: first?.input ?? null,
        source: "IMPORT",
      },
      null,
    );
    for (const t of rest) await addTerm(prisma, id, t.input);
    if (uploader) {
      const terms = await prisma.leaseTerm.findMany({ where: { leaseId: id }, select: { id: true, startsOn: true } });
      for (const t of p.terms) {
        if (!t.pdf) continue;
        const local = path.join(DIR, t.pdf);
        const size = fs.statSync(local).size;
        const up = await uploader.put(`leases/${id}/${path.basename(t.pdf)}`, local, "application/pdf", size);
        const file = await prisma.leaseFile.create({ data: { leaseId: id, url: up.url, pathname: up.pathname, filename: path.basename(t.pdf), size, contentType: "application/pdf" } });
        const term = terms.find((x) => toYmd(x.startsOn) === toYmd(t.input.startsOn));
        if (term) await prisma.leaseTerm.update({ where: { id: term.id }, data: { fileId: file.id } });
      }
    }
    say(`  created ${p.address}${p.unitLabel ? ` · ${p.unitLabel}` : ""}`);
  }
  say(`\nDone: ${todo.length} leases created.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
