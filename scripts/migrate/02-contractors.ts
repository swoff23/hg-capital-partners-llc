/**
 * "Contractor Contact Info" + "Contractor Info" → Contact records (merged, deduped).
 *
 * SECURITY: bank name / account type / name on account / routing # / account # (cols H-L of
 * "Contractor Info") are NEVER read into the database. Only W-9 and insurance links/filenames.
 *
 * Idempotent: upserts keyed by a stable slug of the person's name.
 */
import { prisma } from "../../src/lib/db.ts";
import { report } from "./_report.ts";
import {
  readSheet,
  normalizeEmail,
  normalizePhone,
  formatPhone,
  isUrl,
  parseExcelDate,
} from "./_lib.ts";

type Draft = {
  slug: string;
  fullName: string;
  company: string | null;
  trades: string | null;
  tenantFixes: boolean;
  phoneDigits: string | null;
  email: string | null;
  mailingAddress: string | null;
  billingInfo: string | null;
  availability: string | null;
  w9: string | null;
  coi: string | null;
  comments: string[];
  updatedAt: Date | null;
};

function nameSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/\b(jr|sr|ii|iii)\b/g, "")
    .replace(/[^a-z\s]/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2) // first + last
    .join("-");
}

export async function migrateContractors() {
  report.section("Contractors");
  const drafts = new Map<string, Draft>();
  let bankFieldsSeen = 0;

  const merge = (d: Partial<Draft> & { fullName: string }) => {
    const slug = nameSlug(d.fullName);
    if (!slug) return;
    const existing = drafts.get(slug);
    if (!existing) {
      drafts.set(slug, {
        slug,
        fullName: d.fullName.trim(),
        company: d.company ?? null,
        trades: d.trades ?? null,
        tenantFixes: d.tenantFixes ?? false,
        phoneDigits: d.phoneDigits ?? null,
        email: d.email ?? null,
        mailingAddress: d.mailingAddress ?? null,
        billingInfo: d.billingInfo ?? null,
        availability: d.availability ?? null,
        w9: d.w9 ?? null,
        coi: d.coi ?? null,
        comments: d.comments ?? [],
        updatedAt: d.updatedAt ?? null,
      });
      return;
    }
    const newer = (d.updatedAt?.getTime() ?? 0) >= (existing.updatedAt?.getTime() ?? 0);
    existing.fullName = newer && d.fullName ? d.fullName.trim() : existing.fullName;
    existing.company ??= d.company ?? null;
    existing.trades = [existing.trades, d.trades].filter(Boolean).join(" / ") || null;
    existing.tenantFixes ||= d.tenantFixes ?? false;
    existing.phoneDigits ??= d.phoneDigits ?? null;
    existing.email ??= d.email ?? null;
    existing.mailingAddress ??= d.mailingAddress ?? null;
    existing.billingInfo ??= d.billingInfo ?? null;
    existing.availability ??= d.availability ?? null;
    if (d.w9 && (newer || !existing.w9)) existing.w9 = d.w9;
    if (d.coi && (newer || !existing.coi)) existing.coi = d.coi;
    if (d.comments?.length) existing.comments.push(...d.comments);
    if (newer) existing.updatedAt = d.updatedAt ?? existing.updatedAt;
  };

  // ---- Sheet 1: "Contractor Contact Info" ----
  const cci = await readSheet("Contractor Contact Info");
  for (const r of cci.slice(1)) {
    if (!r["A"]) continue;
    merge({
      fullName: r["A"],
      company: r["B"] && !/^solo$/i.test(r["B"]) ? r["B"] : null,
      trades: r["C"] ?? null,
      tenantFixes: /^yes/i.test(r["D"] ?? ""),
      phoneDigits: normalizePhone(r["E"]),
      email: normalizeEmail(r["F"]),
      billingInfo: r["G"] ?? null,
      availability: r["H"] ?? null,
      comments: r["I"] ? [r["I"]] : [],
    });
  }
  report.line(`"Contractor Contact Info": ${cci.length - 1} rows.`);

  // ---- Sheet 2: "Contractor Info" (has W-9/COI + bank cols to DROP) ----
  const ci = await readSheet("Contractor Info");
  for (const r of ci.slice(1)) {
    if (!r["C"]) continue;
    for (const col of ["H", "I", "J", "K", "L"] as const) if (r[col]) bankFieldsSeen++;

    const w9raw = r["M"];
    const coiraw = r["N"];
    const comments: string[] = [];
    if (w9raw && !isUrl(w9raw)) comments.push(`W-9 on file: ${w9raw}`);
    if (coiraw && !isUrl(coiraw)) comments.push(`Insurance on file: ${coiraw}`);

    merge({
      fullName: r["C"],
      company: r["D"] ?? null,
      trades: r["A"] ?? null,
      phoneDigits: normalizePhone(r["E"]),
      email: normalizeEmail(r["F"]),
      mailingAddress: r["G"] ?? null,
      w9: isUrl(w9raw) ? w9raw : null,
      coi: isUrl(coiraw) ? coiraw : null,
      comments,
      updatedAt: parseExcelDate(r["B"]),
    });
  }
  report.line(`"Contractor Info": ${ci.length - 1} rows.`);
  report.line(
    `🔒 Dropped ${bankFieldsSeen} bank/routing/account field values — never written to the database.`,
  );

  // ---- Second pass: collapse drafts that share a phone or email ----
  const list = [...drafts.values()];
  const canonical = new Map<string, Draft>(); // contact key -> draft
  const keyOf = new Map<Draft, Draft>(); // draft -> its canonical draft
  const identities = (d: Draft) => [d.phoneDigits && `p:${d.phoneDigits}`, d.email && `e:${d.email}`].filter(Boolean) as string[];
  let collapsed = 0;
  for (const d of list) {
    const hit = identities(d)
      .map((k) => canonical.get(k))
      .find(Boolean);
    if (hit) {
      // merge d into hit
      hit.company ??= d.company;
      hit.trades = [...new Set([hit.trades, d.trades].filter(Boolean).flatMap((t) => t!.split(" / ")))].join(" / ") || null;
      hit.tenantFixes ||= d.tenantFixes;
      hit.phoneDigits ??= d.phoneDigits;
      hit.email ??= d.email;
      hit.mailingAddress ??= d.mailingAddress;
      hit.billingInfo ??= d.billingInfo;
      hit.availability ??= d.availability;
      hit.w9 ??= d.w9;
      hit.coi ??= d.coi;
      hit.comments.push(...d.comments);
      if ((d.updatedAt?.getTime() ?? 0) > (hit.updatedAt?.getTime() ?? 0)) hit.updatedAt = d.updatedAt;
      keyOf.set(d, hit);
      collapsed++;
    } else {
      keyOf.set(d, d);
      for (const k of identities(d)) canonical.set(k, d);
    }
  }
  const finalDrafts = list.filter((d) => keyOf.get(d) === d);
  report.line(`Second pass collapsed ${collapsed} duplicate contacts by shared phone/email.`);

  // ---- Upsert ----
  let created = 0;
  let updated = 0;
  for (const d of finalDrafts) {
    const data = {
      fullName: d.fullName,
      company: d.company,
      trades: d.trades,
      tenantFixes: d.tenantFixes,
      phone: formatPhone(d.phoneDigits),
      email: d.email,
      mailingAddress: d.mailingAddress,
      billingInfo: d.billingInfo,
      availability: d.availability,
      w9Url: d.w9,
      coiUrl: d.coi,
      comments: [...new Set(d.comments)].join("\n") || null,
      active: true,
    };
    const existing = await prisma.contact.findFirst({
      where: { fullName: { equals: d.fullName, mode: "insensitive" } },
    });
    if (existing) {
      await prisma.contact.update({ where: { id: existing.id }, data });
      updated++;
    } else {
      await prisma.contact.create({ data });
      created++;
    }
  }
  report.line(`Merged ${cci.length - 1 + (ci.length - 1)} source rows → ${finalDrafts.length} contacts.`);
  report.line(`Created ${created}, updated ${updated}.`);
  report.warn(
    "Contractor dedupe is name+phone/email based — review the Contractors list for any remaining near-duplicates (e.g. nickname vs legal name with no shared phone).",
  );
}
