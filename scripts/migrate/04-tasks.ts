/**
 * "HG_Capital.csv" (Asana export, ~2,175 rows) → Task records.
 *   - Section string → linked Property (via address prefix) or a `bucket` label.
 *   - Assignee email → matched User, else kept as free text (covers contractors).
 *   - Completed At → status DONE. Notes → description.
 *
 * Idempotent: upserts on asanaId.
 */
import fs from "node:fs";
import { parse } from "csv-parse/sync";
import { prisma } from "../../src/lib/db.ts";
import { report } from "./_report.ts";
import { ASANA_CSV_PATH, addressKey, parseExcelDate } from "./_lib.ts";

type Row = Record<string, string>;

function classifySection(section: string): { bucket: string; propertyMatch: string | null } {
  const s = (section || "").trim();
  if (!s) return { bucket: "Unfiled", propertyMatch: null };
  if (/^untitled section$/i.test(s)) return { bucket: "Unfiled", propertyMatch: null };
  if (/^general$/i.test(s)) return { bucket: "General", propertyMatch: null };
  if (/^new .*\[address\]/i.test(s)) return { bucket: "Template", propertyMatch: null };
  if (/^pieter properties$/i.test(s)) return { bucket: "Pieter properties", propertyMatch: null };
  if (/^jmpl properties$/i.test(s)) return { bucket: "JMPL", propertyMatch: null };
  // e.g. "58 Mariner (Conventus) (HG1)" or "118 Congress (HG)"
  if (/^\d+[a-z]?[\/\d]*\s+[A-Za-z]/.test(s)) return { bucket: "Property", propertyMatch: addressKey(s) };
  return { bucket: "Unfiled", propertyMatch: null };
}

export async function migrateTasks() {
  report.section("Tasks (Asana)");
  if (!fs.existsSync(ASANA_CSV_PATH)) {
    report.warn(`${ASANA_CSV_PATH} not found — skipping task migration.`);
    return;
  }

  const rows: Row[] = parse(fs.readFileSync(ASANA_CSV_PATH), {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true,
  });
  report.line(`Parsed ${rows.length} Asana rows.`);

  const users = await prisma.user.findMany();
  const userByEmail = new Map(users.map((u) => [u.email.toLowerCase(), u]));
  const userByFirst = new Map(users.map((u) => [(u.name ?? "").split(" ")[0].toLowerCase(), u]));

  const properties = await prisma.property.findMany({ select: { id: true, address: true } });
  const propByKey = new Map<string, string>();
  for (const p of properties) propByKey.set(addressKey(p.address), p.id);

  const existingIds = new Set(
    (await prisma.task.findMany({ where: { asanaId: { not: null } }, select: { asanaId: true } })).map(
      (t) => t.asanaId!,
    ),
  );

  const bucketCounts: Record<string, number> = {};
  let created = 0;
  let updated = 0;
  let linked = 0;
  let done = 0;
  const unlinkedProperty = new Set<string>();

  for (const r of rows) {
    const asanaId = r["Task ID"]?.trim();
    const title = r["Name"]?.trim();
    if (!asanaId || !title) continue;

    const { bucket, propertyMatch } = classifySection(r["Section/Column"] ?? "");
    bucketCounts[bucket] = (bucketCounts[bucket] ?? 0) + 1;

    let propertyId: string | null = null;
    if (propertyMatch) {
      propertyId = propByKey.get(propertyMatch) ?? null;
      if (propertyId) linked++;
      else unlinkedProperty.add(r["Section/Column"]!.trim());
    }

    const completedAt = parseAsanaDate(r["Completed At"]);
    if (completedAt) done++;

    const email = (r["Assignee Email"] || "").trim().toLowerCase();
    const assignee = userByEmail.get(email) ?? userByFirst.get((r["Assignee"] || "").split(" ")[0].toLowerCase());

    const data = {
      title,
      description: r["Notes"]?.trim() || null,
      status: (completedAt ? "DONE" : "OPEN") as "DONE" | "OPEN",
      assigneeUserId: assignee?.id ?? null,
      assigneeName: !assignee && r["Assignee"]?.trim() ? r["Assignee"].trim() : null,
      assigneeEmail: !assignee && email ? email : null,
      dueDate: parseAsanaDate(r["Due Date"]),
      startDate: parseAsanaDate(r["Start Date"]),
      bucket,
      sectionRaw: r["Section/Column"]?.trim() || null,
      tags: r["Tags"]?.trim() || null,
      propertyId,
      completedAt,
      createdAt: parseAsanaDate(r["Created At"]) ?? undefined,
    };

    await prisma.task.upsert({
      where: { asanaId },
      create: { asanaId, ...data },
      update: data,
    });
    if (existingIds.has(asanaId)) updated++;
    else created++;
  }

  report.line(`Created ${created}, updated ${updated} (idempotent upsert on Asana Task ID).`);
  report.line(`Buckets: ${JSON.stringify(bucketCounts)}`);
  report.line(`${linked} tasks linked to a property; ${done} marked Done.`);
  if (unlinkedProperty.size)
    report.warn(
      `Property-style sections with no matching property (imported unlinked): ${[...unlinkedProperty].join(", ")}`,
    );
  report.line(
    "'Pieter properties' and 'JMPL' buckets left unlinked — confirm whether these are HG assets or separate ventures.",
  );
}

/** Asana dates are "YYYY-MM-DD"; the export also has occasional Excel-ish serials. */
function parseAsanaDate(raw: string | undefined): Date | null {
  if (!raw?.trim()) return null;
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return parseExcelDate(s);
}
