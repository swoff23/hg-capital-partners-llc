import { maskLockbox, type ImportPlan, type Person } from "./map";

/**
 * The text report scripts/asana/20-load.ts and 30-delta.ts print: what a run
 * will write (dry run) or wrote (--apply), and the lists Connor reviews
 * before approving the load, the D25 delete and PORTAL_ENABLED
 * (docs/asana-migration-plan.md §5.5, "Report"). Pure; no I/O.
 */

export interface ReportContext {
  title: string;
  /** Display names for user and contact ids (templates, matches). */
  names: ReadonlyMap<string, string>;
  /** Extra header lines: target database, snapshot, mode. */
  header?: string[];
}

/** Columns every sync rewrites from Asana; not "changes" worth listing. */
const BOOKKEEPING = new Set(["sectionRaw", "tags", "createdAt"]);

const pad = (s: string | number, n: number) => String(s).padEnd(n);
const lpad = (s: string | number, n: number) => String(s).padStart(n);
const mb = (bytes: number) => `${(bytes / 1e6).toFixed(1)} MB`;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 3)}...` : s);

function matchLabel(p: Person, names: ReadonlyMap<string, string>): string {
  const m = p.match;
  if (m.kind === "user") return `staff ${names.get(m.userId) ?? m.userId} (by ${m.via})`;
  if (m.kind === "contact") return `contact ${names.get(m.contactId) ?? m.contactId} (by ${m.via}${m.confirmed ? "" : ", NOT confirmed"})`;
  return `no match (${m.reason})${m.suggestions.length ? `; maybe ${m.suggestions.join(", ")}` : ""}`;
}

export function formatReport(plan: ImportPlan, ctx: ReportContext): string {
  const out: string[] = [];
  const h = (s: string) => out.push("", `-- ${s} ${"-".repeat(Math.max(0, 72 - s.length))}`);
  const r = plan.report;
  out.push(`== ${ctx.title} ==`, ...(ctx.header ?? []));

  if (plan.mode === "load") {
    h("Sections");
    out.push(`  ${pad("section", 34)}${pad("kind", 10)}${pad("property", 38)}${lpad("tasks", 6)}${lpad("open", 6)}${lpad("import", 8)}${lpad("subtasks", 10)}`);
    for (const s of r.sections) {
      out.push(`  ${pad(clip(s.name, 33), 34)}${pad(s.kind, 10)}${pad(clip(s.property ?? "", 37), 38)}${lpad(s.total, 6)}${lpad(s.open, 6)}${lpad(s.importing, 8)}${lpad(s.subtasks, 10)}`);
    }
    if (r.unmatchedPropertySections.length) out.push(`  ! property sections with no matching Property (imported as Unfiled): ${r.unmatchedPropertySections.join(", ")}`);
  }

  h("Tasks");
  const creates = plan.tasks.filter((t) => t.op === "create");
  const updates = plan.tasks.filter((t) => t.op === "update");
  const changedFields = (w: object) => Object.keys(w).filter((k) => !BOOKKEEPING.has(k));
  const changed = updates.filter((t) => changedFields(t.write).length);
  const deletable = plan.deletes.filter((d) => !d.heldBack);
  out.push(
    `  create ${creates.length}, update ${updates.length} (${changed.length} with field changes), ` +
      (plan.mode === "load" ? `delete (D25) ${deletable.length}, held back ${plan.deletes.length - deletable.length}, app-only kept ${plan.appOnly.length}` : "no deletes in a delta"),
  );
  if (plan.mode === "load") out.push(`  not imported: ${r.skipped.completed} completed, ${r.skipped.archive} in Pieter/JMPL sections, ${r.skipped.playbook} playbook steps`);
  const closed = plan.tasks.filter((t) => t.status === "close");
  const reopened = plan.tasks.filter((t) => t.status === "reopen");
  if (closed.length) out.push(`  completed in Asana, now Done (${closed.length}): ${closed.map((t) => `"${clip(t.title, 40)}"`).join(", ")}`);
  if (reopened.length) out.push(`  reopened (${reopened.length}): ${reopened.map((t) => `"${clip(t.title, 40)}"`).join(", ")}`);
  const repeats = plan.tasks.filter((t) => t.repeatOnClose);
  if (repeats.length) out.push(`  repeating tasks closed by Asana, next copy created in the app (${repeats.length}): ${repeats.map((t) => `"${clip(t.title, 40)}"`).join(", ")}`);
  const adopted = plan.tasks.filter((t) => t.seriesFrom);
  if (adopted.length) out.push(`  repeating tasks closed by Asana, which made the next copy itself; that copy joins the series (${adopted.length}): ${adopted.map((t) => `"${clip(t.title, 40)}"`).join(", ")}`);
  for (const t of creates.slice(0, plan.mode === "delta" ? 50 : 0)) out.push(`  + ${clip(t.title, 60)}  [${t.sectionName ?? ""}]`);
  for (const t of changed.slice(0, plan.mode === "delta" ? 100 : 0)) {
    out.push(`  ~ ${clip(t.title, 60)}: ${changedFields(t.write).join(", ")}`);
  }

  h("Timeline events (new / already imported)");
  for (const [k, v] of Object.entries(r.eventsByKind).sort()) out.push(`  ${pad(k, 12)}${lpad(v.new, 6)} /${lpad(v.existing, 6)}`);
  const dropped = Object.entries(r.droppedStories).sort((a, b) => b[1] - a[1]);
  if (dropped.length) out.push(`  dropped as noise: ${dropped.map(([k, v]) => `${k} ${v}`).join(", ")}`);

  h("Checklist items (from subtasks)");
  out.push(`  create ${r.checklist.create}, update ${r.checklist.update}, unchanged ${r.checklist.unchanged}`);

  if (plan.mode === "load") {
    h("Templates (D28)");
    for (const t of plan.templates) {
      out.push(`  ${t.name}${t.anchorLabel ? ` (anchor: ${t.anchorLabel})` : ""}: ${t.items.length} items, ${t.existingId ? "exists (kept)" : "new"}`);
      t.items.forEach((i, n) => {
        const who = i.assigneeUserId ?? i.assigneeContactId;
        const label = who ? (ctx.names.get(who) ?? who) : i.assigneeName ? `${i.assigneeName}, unmatched` : "";
        out.push(`    ${lpad(n + 1, 2)}. ${clip(i.title, 60)}${label ? `  (${label})` : ""}${i.checklist?.length ? `  [${i.checklist.length} checklist]` : ""}`);
      });
      if (t.skippedCompleted.length) out.push(`    left out, completed in Asana: ${t.skippedCompleted.join("; ")}`);
    }
  }

  h("Files");
  out.push(`  upload ${r.files.upload} (${mb(r.files.uploadBytes)}), already uploaded ${r.files.existing}, links ${r.files.links}, missing ${r.files.missing.length}`);
  for (const m of r.files.missing) out.push(`  ! missing: "${m.filename}" on "${clip(m.taskTitle, 50)}" (${m.asanaGid}): ${m.reason}`);

  // Every Asana user in the input (§5.5 "a review list of every user ID found anywhere in the snapshot"):
  // an --apply saves the Asana id of every staff and confirmed contact match below, on imported work or not.
  h("People");
  const line = (p: (typeof plan.people)[number]) => `  ${pad(clip(`${p.name}${p.email ? ` <${p.email}>` : ""}`, 46), 47)}${lpad(p.refs, 4)}x  ${matchLabel(p, ctx.names)}  [${p.gid}]`;
  const relevant = plan.people.filter((p) => p.refs > 0).sort((a, b) => b.refs - a.refs);
  const others = plan.people.filter((p) => p.refs === 0).sort((a, b) => a.name.localeCompare(b.name));
  const counts = { user: 0, contact: 0, none: 0 };
  for (const p of relevant) counts[p.match.kind]++;
  out.push(`  on imported work: ${relevant.length} people; ${counts.user} staff, ${counts.contact} contacts, ${counts.none} unmatched (shown as text)`);
  for (const p of relevant) out.push(line(p));
  if (others.length) {
    out.push(`  not on imported work (archived or completed only), ${others.length}; matches here are saved too:`);
    for (const p of others) out.push(line(p));
  }
  if (r.pendingNameMatches.length) {
    out.push("  Name-only matches wait for confirmation. To confirm, add to people.json (or pass --accept-name-matches):");
    out.push(`    ${JSON.stringify(Object.fromEntries(r.pendingNameMatches.map((p) => [p.gid, { contactId: p.contactId }])))}`);
  }

  if (r.conflicts.length) {
    h(`Conflicts (${r.conflicts.length}): the app's value was kept`);
    for (const c of r.conflicts) out.push(`  "${clip(c.title, 50)}" (${c.taskId}): ${c.text}`);
  }

  h("Text that looks like a lockbox or door code (digits masked)");
  if (!r.lockbox.length) out.push("  none");
  for (const l of r.lockbox) out.push(`  "${clip(maskLockbox(l.title), 50)}" (${l.taskId}) ${l.where}: ${l.snippet}`);

  h("Will see: each contractor's jobs (review before PORTAL_ENABLED)");
  if (!r.willSee.length) out.push("  no confirmed contractor is assigned a job here");
  for (const w of r.willSee) {
    const open = w.jobs.filter((j) => !j.closed).length;
    const closedJobs = w.jobs.length - open;
    out.push(`  ${w.name} (${w.contactId}): ${open} open job${open === 1 ? "" : "s"}${closedJobs ? `, ${closedJobs} closed (still visible, read-only)` : ""}`);
    for (const j of w.jobs) {
      const bits = [j.hasNotes ? "notes" : "", `${j.comments} shared comments`, `${j.files} files`, j.lockbox ? `${j.lockbox} LOCKBOX-LOOKING TEXT` : ""].filter(Boolean);
      out.push(`    - ${j.closed ? "[closed] " : ""}${clip(maskLockbox(j.title), 50)} @ ${clip(j.where, 40)}: ${bits.join(", ")}`);
      for (const c of j.commentLines) out.push(`        "${clip(c, 110)}"`);
      if (j.fileNames.length) out.push(`        files: ${clip(maskLockbox(j.fileNames.join(", ")), 110)}`);
    }
  }

  if (plan.mode === "load") {
    h(`D25 delete list: ${deletable.length} rows (only with --delete --apply)`);
    const byReason = new Map<string, number>();
    for (const d of plan.deletes) byReason.set(d.reason, (byReason.get(d.reason) ?? 0) + 1);
    out.push(`  ${[...byReason].map(([k, v]) => `${k}: ${v}`).join("; ") || "nothing to delete"}`);
    for (const d of plan.deletes) {
      out.push(
        `  ${d.heldBack ? "HOLD" : "del "} ${pad(d.taskId, 26)}${pad(d.status, 12)}${pad(clip(d.sectionRaw ?? d.bucket, 28), 29)}${clip(d.title, 60)}` +
          `${d.attachmentCount ? `  [${d.attachmentCount} file${d.attachmentCount === 1 ? "" : "s"}, deleted too]` : ""}${d.heldBack ? `  (held back: ${d.heldBack})` : ""}  : ${d.reason}`,
      );
    }
    h(`App-only tasks, kept: ${plan.appOnly.length}`);
    for (const a of plan.appOnly) out.push(`  ${pad(a.taskId, 26)}${pad(a.status, 12)}${clip(a.title, 70)}`);
  }

  if (r.goneFromAsana.length) {
    h(`Synced before, not in Asana's project now (left alone): ${r.goneFromAsana.length}`);
    for (const g of r.goneFromAsana) out.push(`  ${pad(g.taskId, 26)}${pad(g.asanaId, 18)}${clip(g.title, 60)}`);
  }

  h("Links");
  out.push(`  Asana task links rewritten to /tasks/<id>: ${r.links.rewritten}; pointing at tasks not imported (left as Asana links): ${r.links.unresolved}`);
  const STALE = /^synced from newer Asana data/;
  const stale = plan.tasks.filter((t) => t.notes.some((n) => STALE.test(n))).length;
  const notes = [
    ...(stale ? [`${stale} tasks were synced from newer Asana data than this input; their fields were left alone and only missing history was added`] : []),
    ...r.notes,
    ...plan.tasks.flatMap((t) => t.notes.filter((n) => !/^completed in Asana$|^reopened/.test(n) && !STALE.test(n)).map((n) => `"${clip(t.title, 40)}": ${n}`)),
  ];
  if (notes.length) {
    h("Notes");
    for (const n of notes) out.push(`  ${n}`);
  }
  return out.join("\n");
}
