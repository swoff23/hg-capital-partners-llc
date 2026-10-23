import type { AsanaAttachment, AsanaRef, AsanaStory, AsanaTask } from "../map";

/**
 * A synthetic Asana snapshot shaped like what scripts/asana/10-snapshot.ts
 * saves, for map.test.ts and for scripts/asana/fixtures/make-fixture.ts
 * (which writes it to disk with real image files so 20-load.ts can be run
 * end to end without a token). Deterministic: the same world gives the same
 * snapshot, gid for gid.
 *
 * Modeled on HG's real project: property sections like "118 Congress (HG)",
 * General, an Untitled section, Pieter's and JMPL's archived sections, the
 * four "NEW ... [Address]" playbooks; mostly reschedules, a few comments
 * (half from contractors), iPhone photos and videos, admin subtasks.
 */

export interface FixturePerson {
  gid: string;
  name: string;
  email: string | null;
}

export interface FixtureWorld {
  projectGid: string;
  /** manifest.snapshotStartedAt; every timestamp is before it. */
  startedAt: string;
  staff: FixturePerson[];
  /** Asana users who are contractors (assignees, commenters, uploaders). */
  contractors: FixturePerson[];
  /** People in no app table: they must show up as unmatched. */
  strangers: FixturePerson[];
  /**
   * Real CSV rows to reuse by gid, so reconciliation has rows to update and
   * delete. A row with `parentGid` becomes a subtask of that (earlier) row.
   * Rows in playbook sections replace the built-in playbooks.
   */
  existing: Array<{
    gid: string;
    name: string;
    section: string;
    completed: boolean;
    parentGid?: string;
    assignee?: FixturePerson | null;
    notes?: string | null;
    dueOn?: string | null;
  }>;
}

/**
 * Not HG's real project (1208826670424350): a fixture's gid, so nothing can
 * mistake it for a real snapshot. 20-load.ts and 30-delta.ts refuse to apply
 * it (or anything marked synthetic) to a non-local database.
 */
export const FIXTURE_PROJECT_GID = "1209999999999999";

export const DEFAULT_WORLD: FixtureWorld = {
  projectGid: FIXTURE_PROJECT_GID,
  startedAt: "2026-10-24T13:00:00.000Z",
  staff: [
    { gid: "248676381103488", name: "Connor Swofford", email: "connoraswofford@gmail.com" },
    { gid: "1208826670424355", name: "Pieter Louw", email: "pieter@queencitycorp.com" },
  ],
  contractors: [
    { gid: "1209000000000101", name: "Zed Carpenter", email: "zed@carpentry.example" },
    { gid: "1209000000000102", name: "Ivy Electric", email: "ivy@electric.example" },
    { gid: "1209000000000103", name: "Pat Plumber", email: null },
  ],
  strangers: [
    { gid: "1209000000000201", name: "Rae Realtor", email: "rae@realty.example" },
    { gid: "1209000000000202", name: "(former user)", email: null },
  ],
  existing: [],
};

export const FIXTURE_SECTIONS = [
  "118 Congress (HG)",
  "767 Prospect (Vontive) (HG)",
  "415 Crescent (Vontive) (HG2)",
  "23 Sherwood (Vontive) (HG2)",
  "58 Mariner (Conventus) (HG1)",
  "General",
  "Untitled section",
  "50 Example (HG3)",
  "Pieter properties",
  "JMPL Properties",
  "NEW TENANT [Address]",
  "NEW REFI [Address]",
  "NEW PROPERTY [Address]",
  "NEW MOVE OUT [Address]",
];

const JOBS = [
  "Replace kitchen faucet",
  "Mini splits unit 5",
  "Bathroom tile, unit 2",
  "Fix front steps",
  "Call plumber about the water line",
  "Order laundry tub",
  "Gutter cleaning",
  "Smoke detector check",
  "Paint the hallway",
  "Cabinet install, unit 2",
  "Furnace service",
  "Replace back door lock",
  "Patch drywall in unit 1",
  "Rental registration inspection",
  "Snow removal contract",
];
const GENERAL = ["Renew umbrella policy", "Send W-9 requests", "Quarterly tax payment", "Update the rent roll"];
const PLAYBOOKS: Record<string, string[]> = {
  "NEW TENANT [Address]": ["Collect deposit from [Tenant]", "Lease signed by [Tenant]", "Utilities into [Tenant]'s name", "Move-in walkthrough photos", "Give keys and lockbox code"],
  "NEW REFI [Address]": ["Order appraisal for [Address]", "Send rent roll to lender", "Insurance binder to lender"],
  "NEW PROPERTY [Address]": ["Change locks at [Address]", "Set up utilities", "Add to insurance policy"],
  "NEW MOVE OUT [Address]": ["Move-out inspection at [Address]", "Return deposit to [Tenant]"],
};

export type FixtureFormat = "png" | "jpg" | "heic" | "mov" | "pdf";

/** An Asana-hosted file the snapshot has on disk (the generator creates the bytes). */
export interface FixtureFile {
  attachmentGid: string;
  name: string;
  format: FixtureFormat;
}

export interface FixtureSnapshot {
  manifest: { snapshotStartedAt: string; finishedAt: string; status: string; withFiles: boolean; project: { gid: string; name: string }; synthetic: true };
  project: { gid: string; name: string };
  sections: AsanaRef[];
  users: AsanaRef[];
  tasks: AsanaTask[];
  stories: Record<string, AsanaStory[]>;
  attachments: Record<string, AsanaAttachment[]>;
  files: FixtureFile[];
}

/** Gids that look like Asana's 16-digit ones, counting up (well inside Number.MAX_SAFE_INTEGER). */
function gidCounter(start: number) {
  let n = start;
  return () => (n++).toString();
}

const iso = (ms: number) => new Date(ms).toISOString();
const DAY = 86_400_000;
const ymd = (ms: number) => iso(ms).slice(0, 10);

/** The snapshot. Every fourth property task is completed; a few of everything else. */
export function buildFixture(world: FixtureWorld = DEFAULT_WORLD): FixtureSnapshot {
  const gid = gidCounter(1209900000000001);
  const start = Date.parse(world.startedAt);
  const ref = (p: FixturePerson): AsanaRef => ({ gid: p.gid, name: p.name, email: p.email });
  const [connor, pieter] = world.staff;
  const crew = world.contractors;
  const sections: AsanaRef[] = FIXTURE_SECTIONS.map((name) => ({ gid: gid(), name }));
  for (const e of world.existing) if (!sections.some((s) => s.name === e.section)) sections.push({ gid: gid(), name: e.section });
  const sectionRef = (name: string) => sections.find((s) => s.name === name)!;
  const membership = (name: string) => [{ project: { gid: world.projectGid, name: "HG Capital" }, section: sectionRef(name) }];

  const tasks: AsanaTask[] = [];
  const stories: Record<string, AsanaStory[]> = {};
  const attachments: Record<string, AsanaAttachment[]> = {};
  const files: FixtureFile[] = [];
  const story = (taskGid: string, s: Omit<AsanaStory, "gid">) => {
    (stories[taskGid] ??= []).push({ gid: gid(), ...s });
  };
  const attach = (taskGid: string, name: string, at: number, opts: { host?: string; format?: FixtureFormat; url?: string } = {}) => {
    const a: AsanaAttachment = {
      gid: gid(),
      name,
      resource_subtype: opts.host && opts.host !== "asana" ? "external" : "asana",
      host: opts.host ?? "asana",
      size: null, // the generator fills in the real size once the bytes exist
      created_at: iso(at),
      view_url: opts.url ?? `https://app.asana.com/app/asana/-/get_asset?asset_id=${taskGid}`,
      permanent_url: `https://app.asana.com/app/asana/-/get_asset?asset_id=${taskGid}`,
      parent: { gid: taskGid },
    };
    (attachments[taskGid] ??= []).push(a);
    if ((opts.host ?? "asana") === "asana" && opts.format) files.push({ attachmentGid: a.gid, name, format: opts.format });
    return a;
  };
  const noise = (taskGid: string, at: number, by: FixturePerson) => {
    story(taskGid, { created_at: iso(at), created_by: ref(by), resource_subtype: "added_to_project", type: "system", text: "added to HG Capital" });
    story(taskGid, { created_at: iso(at + 60_000), created_by: ref(by), resource_subtype: "follower_added", type: "system", text: "added a follower" });
  };

  const top = (name: string, section: string, i: number, o: Partial<AsanaTask> = {}): AsanaTask => {
    const created = o.created_at ? Date.parse(o.created_at) : start - (80 - i) * DAY;
    const t: AsanaTask = {
      gid: gid(),
      name,
      notes: "",
      html_notes: "<body></body>",
      resource_subtype: "default_task",
      assignee: null,
      created_by: ref(i % 3 === 0 ? pieter : connor),
      created_at: iso(created),
      modified_at: iso(start - (i % 5) * DAY),
      completed: false,
      completed_at: null,
      completed_by: null,
      due_on: ymd(start + ((i % 9) - 3) * DAY),
      due_at: null,
      start_on: null,
      followers: [],
      memberships: membership(section),
      parent: null,
      num_subtasks: 0,
      permalink_url: `https://app.asana.com/0/${world.projectGid}/${i}`,
      tags: [],
      in_project: true,
      ...o,
    };
    t.permalink_url = `https://app.asana.com/0/${world.projectGid}/${t.gid}`;
    tasks.push(t);
    noise(t.gid, created + 1000, t.created_by ? world.staff.find((s) => s.gid === t.created_by!.gid) ?? connor : connor);
    return t;
  };
  const sub = (parent: AsanaTask, name: string, o: Partial<AsanaTask> = {}): AsanaTask => {
    const created = Date.parse(parent.created_at!) + 3600_000 * (tasks.length % 7);
    const s: AsanaTask = {
      gid: gid(),
      name,
      notes: "",
      html_notes: "<body></body>",
      assignee: null,
      created_by: parent.created_by,
      created_at: iso(created),
      modified_at: iso(created),
      completed: false,
      completed_at: null,
      completed_by: null,
      due_on: null,
      memberships: [],
      parent: { gid: parent.gid, name: parent.name },
      num_subtasks: 0,
      in_project: false,
      ...o,
    };
    tasks.push(s);
    parent.num_subtasks = (parent.num_subtasks ?? 0) + 1;
    return s;
  };
  const complete = (t: AsanaTask, by: FixturePerson, at: number) => {
    t.completed = true;
    t.completed_at = iso(at);
    t.completed_by = ref(by);
    story(t.gid, { created_at: iso(at), created_by: ref(by), resource_subtype: "marked_complete", type: "system", text: "marked this task complete" });
  };
  const reschedule = (t: AsanaTask, by: FixturePerson, times: number) => {
    let due = Date.parse(`${t.due_on}T00:00:00Z`) - times * 2 * DAY;
    for (let k = 0; k < times; k++) {
      const next = due + 2 * DAY;
      story(t.gid, {
        created_at: iso(Date.parse(t.created_at!) + (k + 1) * DAY),
        created_by: ref(by),
        resource_subtype: "due_date_changed",
        type: "system",
        text: `changed the due date to ${ymd(next)}`,
        old_dates: { start_on: null, due_at: null, due_on: ymd(due) },
        new_dates: { start_on: null, due_at: null, due_on: ymd(next) },
      });
      due = next;
    }
  };
  const assign = (t: AsanaTask, to: FixturePerson, by: FixturePerson) => {
    t.assignee = ref(to);
    story(t.gid, { created_at: iso(Date.parse(t.created_at!) + 5 * 60_000), created_by: ref(by), resource_subtype: "assigned", type: "system", text: `assigned to ${to.name}`, assignee: ref(to) });
  };
  const comment = (t: AsanaTask, by: FixturePerson, at: number, text: string, html?: string) =>
    story(t.gid, { created_at: iso(at), created_by: ref(by), resource_subtype: "comment_added", type: "comment", text, html_text: html ?? `<body>${text}</body>`, is_edited: false, is_pinned: false });

  // --- Property jobs ----------------------------------------------------------
  const propertySections = FIXTURE_SECTIONS.slice(0, 5);
  const jobs: AsanaTask[] = [];
  JOBS.forEach((name, i) => {
    const section = propertySections[i % propertySections.length];
    const t = top(name, section, i);
    jobs.push(t);
    const created = Date.parse(t.created_at!);
    const worker = crew[i % crew.length];
    if (i % 5 !== 4) assign(t, i % 5 === 3 ? connor : worker, connor);
    reschedule(t, i % 2 ? connor : pieter, (i % 4) + 1);
    if (i % 4 === 3) complete(t, worker, start - (i % 6) * DAY);
    if (i % 3 === 0) {
      comment(t, connor, created + 2 * DAY, "Can you send photos when it's done?");
      comment(t, worker, created + 3 * DAY, "Parts are on order, back Thursday.");
    }
    story(t.gid, { created_at: iso(created + 4 * DAY), created_by: ref(worker), resource_subtype: "liked", type: "system", text: "liked this task" });
    story(t.gid, { created_at: iso(created + 5 * DAY), created_by: null, resource_subtype: "due_today", type: "system", text: "This task is due today" });
  });

  // Notes: a lockbox code (synthetic), a link to another imported task, a link to a completed one.
  jobs[0].notes = "Lockbox 4821 on the side door. Water shutoff is in the basement.";
  jobs[0].html_notes = `<body>${jobs[0].notes}</body>`;
  jobs[1].notes = `Same supplier as ${jobs[2].permalink_url}/f. Old quote: ${jobs[3].permalink_url}`;
  jobs[1].html_notes = `<body>${jobs[1].notes}</body>`;
  jobs[4].notes = "Tenant in unit 1 works nights, call before 2pm.\r\n\r\nGate code 1357.";

  // Files on the first job: iPhone photo and video, a PNG, a PDF, a Dropbox link, a video message, one missing.
  const j0 = jobs[0];
  const w0 = crew[0];
  const t0 = Date.parse(j0.created_at!) + 6 * DAY;
  for (const [k, [name, format]] of ([
    ["IMG_0412.HEIC", "heic"],
    ["IMG_0413.JPG", "jpg"],
    ["walkthrough.MOV", "mov"],
    ["front steps.png", "png"],
    ["Invoice #1182.pdf", "pdf"],
  ] as Array<[string, FixtureFormat]>).entries()) {
    const at = t0 + k * 60_000;
    attach(j0.gid, name, at, { format });
    story(j0.gid, { created_at: iso(at + 2000), created_by: ref(k === 4 ? connor : w0), resource_subtype: "attachment_added", type: "system", text: `attached ${name}` });
  }
  attach(j0.gid, "Plans.pdf", t0 + 10 * 60_000, { host: "dropbox", url: "https://www.dropbox.com/s/example/Plans.pdf" });
  attach(j0.gid, "Walkthrough video message", t0 + 11 * 60_000, { host: "vimeo", url: "https://vimeo.com/000000000" });
  attach(j0.gid, "IMG_0499.JPG", t0 + 12 * 60_000); // listed by Asana, never downloaded: reported missing
  // An image pasted into a comment: no attachment_added story, matched through the comment's HTML.
  const pasted = attach(j0.gid, "image.png", t0 + 20 * 60_000, { format: "png" });
  comment(j0, w0, t0 + 20 * 60_000 + 500, "Here's the crack by the bottom step", `<body>Here's the crack by the bottom step <img data-asana-gid="${pasted.gid}" src="https://app.asana.com/app/asana/-/get_asset?asset_id=${pasted.gid}"></body>`);
  comment(j0, connor, t0 + DAY, "Lock box code is 4821 if the tenant isn't home.");

  // Subtasks: an admin checklist, one done, one nested, one with notes and a photo.
  const j2 = jobs[2];
  const s1 = sub(j2, "Pick tile color");
  complete(s1, connor, Date.parse(s1.created_at!) + DAY);
  const s2 = sub(j2, "Order grout", { assignee: ref(crew[1]), due_on: ymd(start + 2 * DAY) });
  sub(s2, "Confirm the delivery window");
  const s3 = sub(j2, "Demo old tile", { notes: "Bag the debris; the dumpster is gone." });
  comment(s3, crew[1], Date.parse(s3.created_at!) + DAY, "Done with demo, see photo");
  const s3at = Date.parse(s3.created_at!) + DAY + 30_000;
  attach(s3.gid, "IMG_0520.JPG", s3at, { format: "jpg" });
  story(s3.gid, { created_at: iso(s3at + 1000), created_by: ref(crew[1]), resource_subtype: "attachment_added", type: "system", text: "attached IMG_0520.JPG" });
  story(s3.gid, { created_at: iso(s3at + 2000), created_by: ref(connor), resource_subtype: "due_date_changed", type: "system", text: "changed the due date", old_dates: null, new_dates: { due_on: ymd(start) } });

  // History that maps to each event kind.
  const j5 = jobs[5];
  story(j5.gid, { created_at: iso(Date.parse(j5.created_at!) + DAY), created_by: ref(connor), resource_subtype: "section_changed", type: "system", text: "moved this task from General to 767 Prospect", old_section: sectionRef("General"), new_section: sectionRef(propertySections[0]) });
  story(j5.gid, { created_at: iso(Date.parse(j5.created_at!) + DAY + 1000), created_by: ref(connor), resource_subtype: "name_changed", type: "system", text: "changed the name", old_name: "Laundry tub", new_name: j5.name });
  story(j5.gid, { created_at: iso(Date.parse(j5.created_at!) + DAY + 2000), created_by: ref(connor), resource_subtype: "notes_changed", type: "system", text: "changed the description" });
  story(j5.gid, { created_at: iso(Date.parse(j5.created_at!) + 2 * DAY), created_by: ref(crew[2]), resource_subtype: "marked_complete", type: "system", text: "marked this task complete" });
  story(j5.gid, { created_at: iso(Date.parse(j5.created_at!) + 2 * DAY + 1000), created_by: ref(connor), resource_subtype: "marked_incomplete", type: "system", text: "marked incomplete" });
  story(j5.gid, { created_at: iso(Date.parse(j5.created_at!) + 2 * DAY + 2000), created_by: ref(connor), resource_subtype: "unassigned", type: "system", text: "unassigned" });
  story(j5.gid, { created_at: iso(Date.parse(j5.created_at!) + 2 * DAY + 3000), created_by: null, resource_subtype: "task_assigned_reminder", type: "system", text: "reminder" });
  story(j5.gid, { created_at: iso(Date.parse(j5.created_at!) + 2 * DAY + 4000), created_by: ref(connor), resource_subtype: "marked_today", type: "system", text: "marked for today" });

  // Assigned to people the app doesn't know.
  assign(jobs[6], world.strangers[0], pieter);
  if (world.strangers[1]) assign(jobs[7], world.strangers[1], connor);
  jobs[8].due_on = null;
  jobs[8].due_at = "2026-10-26T02:30:00.000Z"; // 10:30pm Oct 25 in Buffalo

  // --- General, Untitled, a property the app doesn't have ------------------------------
  GENERAL.forEach((name, i) => {
    const t = top(name, "General", 20 + i, { assignee: ref(i % 2 ? pieter : connor) });
    if (i === 3) complete(t, connor, start - DAY);
  });
  top("Figure out the gas bill", "Untitled section", 30);
  top("Walk the new place", "50 Example (HG3)", 31, { assignee: ref(connor) });

  // --- Archived ventures (D5): never imported, even when open --------------------------
  top("Roof estimate", "Pieter properties", 40, { assignee: ref(pieter) });
  top("Closing docs", "JMPL Properties", 41, { assignee: ref(pieter) });

  // --- Playbooks (D28) -----------------------------------------------------------------
  let k = 50;
  const realPlaybooks = world.existing.some((e) => /\[address\]/i.test(e.section));
  for (const [section, items] of realPlaybooks ? [] : Object.entries(PLAYBOOKS)) {
    items.forEach((name, i) => {
      const t = top(name, section, k++, { due_on: null, assignee: i === 0 ? ref(connor) : i === 1 ? ref(crew[0]) : null, notes: i === 0 ? "Template step: fill in [Tenant] and [Address]." : "" });
      if (section.startsWith("NEW REFI") && i === 2) complete(t, connor, start - 30 * DAY);
      if (section.startsWith("NEW TENANT") && i === 4) sub(t, "Photo of the lockbox");
    });
  }

  // --- Real CSV rows, reused by gid --------------------------------------------------------
  const extraPeople = new Map<string, FixturePerson>();
  const byGid = new Map(tasks.map((t) => [t.gid, t]));
  world.existing
    .filter((e) => !e.parentGid)
    .forEach((e, i) => {
      const t = top(e.name, e.section, 60 + i, {
        gid: e.gid,
        created_at: iso(start - (5 + (i % 300)) * DAY),
        notes: e.notes ?? "",
        due_on: e.dueOn !== undefined ? e.dueOn : ymd(start + ((i % 9) - 3) * DAY),
      });
      byGid.set(t.gid, t);
      const who = e.assignee !== undefined ? e.assignee : i % 2 === 0 ? crew[i % crew.length] : null;
      if (who) {
        assign(t, who, connor);
        if (!world.staff.some((s) => s.gid === who.gid) && !crew.some((c) => c.gid === who.gid)) extraPeople.set(who.gid, who);
      }
      if (t.due_on) reschedule(t, connor, 1 + (i % 3));
      if (i % 7 === 1 && who) comment(t, who, Date.parse(t.created_at!) + DAY, "On it this week.");
      if (e.completed) complete(t, connor, start - (2 + (i % 60)) * DAY);
    });
  world.existing
    .filter((e) => e.parentGid)
    .forEach((e, i) => {
      const parent = byGid.get(e.parentGid!);
      if (!parent) return;
      const s = sub(parent, e.name, { gid: e.gid });
      if (e.completed) complete(s, connor, Date.parse(parent.created_at!) + (1 + (i % 5)) * DAY);
    });

  const users = [...world.staff, ...crew, ...world.strangers, ...extraPeople.values()].map(ref);
  return {
    manifest: {
      snapshotStartedAt: world.startedAt,
      finishedAt: iso(start + 40 * 60_000),
      status: "complete",
      withFiles: true,
      project: { gid: world.projectGid, name: "HG Capital" },
      synthetic: true,
    },
    project: { gid: world.projectGid, name: "HG Capital" },
    sections,
    users,
    tasks,
    stories,
    attachments,
    files,
  };
}

/** What 30-delta.ts saves per run: the listing, full records of what it re-fetched, new stories and files. */
export interface FixtureDelta {
  meta: { cursor: string; startedAt: string; modified: string[]; synthetic: true };
  tasks: AsanaTask[];
  stories: Record<string, AsanaStory[]>;
  attachments: Record<string, AsanaAttachment[]>;
  files: FixtureFile[];
  /** What changed, for the person running the fixture. */
  changes: string[];
  /** A title to set in the app on this task before replaying, to make a conflict. */
  appEdit: { gid: string; title: string } | null;
}

/**
 * A day of Asana activity after `snap`, as a delta run would fetch it.
 * Touches imported tasks only, in ways each rule in the merge has to handle.
 */
export function buildDeltaFixture(snap: FixtureSnapshot, startedAt: string): FixtureDelta {
  const gid = gidCounter(1209950000000001);
  const at = Date.parse(startedAt);
  const tasks: AsanaTask[] = structuredClone(snap.tasks);
  const stories: Record<string, AsanaStory[]> = structuredClone(snap.stories);
  const attachments: Record<string, AsanaAttachment[]> = structuredClone(snap.attachments);
  const files: FixtureFile[] = [];
  const modified = new Set<string>();
  const changes: string[] = [];
  const projectGid = snap.project.gid;
  const users = new Map(snap.users.map((u) => [u.gid, u]));
  const connor = users.get(DEFAULT_WORLD.staff[0].gid) ?? snap.users[0];
  const zed = snap.users.find((u) => u.gid === DEFAULT_WORLD.contractors[0].gid) ?? snap.users[2];
  const sectionNamed = (name: string) => snap.sections.find((s) => s.name === name)!;
  const sectionName = (t: AsanaTask) => t.memberships?.find((m) => m.project?.gid === projectGid)?.section?.name ?? "";
  const open = tasks.filter((t) => t.in_project && !t.parent && !t.completed && !/pieter|jmpl|\[address\]/i.test(sectionName(t)) && sectionName(t) !== "");
  const touch = (t: AsanaTask, ms: number) => {
    t.modified_at = new Date(ms).toISOString();
    modified.add(t.gid);
  };
  const add = (taskGid: string, s: Omit<AsanaStory, "gid">) => (stories[taskGid] ??= []).push({ gid: gid(), ...s });
  const by = (name: string) => open.find((t) => t.name === name) ?? open[0];

  // 1. Completed in Asana by the contractor on it: always applies.
  const done = by("Mini splits unit 5");
  done.completed = true;
  done.completed_at = new Date(at - 3 * 3600_000).toISOString();
  done.completed_by = done.assignee ?? zed;
  add(done.gid, { created_at: done.completed_at, created_by: done.completed_by, resource_subtype: "marked_complete", type: "system", text: "marked this task complete" });
  touch(done, at - 3 * 3600_000);
  changes.push(`completed in Asana: "${done.name}"`);

  // 2. A new comment and photo from the contractor on their job.
  const photo = by("Replace kitchen faucet");
  const pAt = at - 2 * 3600_000;
  add(photo.gid, { created_at: new Date(pAt).toISOString(), created_by: zed, resource_subtype: "comment_added", type: "comment", text: "New faucet is in. Photo attached.", html_text: "<body>New faucet is in. Photo attached.</body>" });
  const att: AsanaAttachment = { gid: gid(), name: "IMG_0601.JPG", resource_subtype: "asana", host: "asana", size: null, created_at: new Date(pAt + 5000).toISOString(), view_url: null, permanent_url: null, parent: { gid: photo.gid } };
  (attachments[photo.gid] ??= []).push(att);
  files.push({ attachmentGid: att.gid, name: att.name, format: "jpg" });
  add(photo.gid, { created_at: new Date(pAt + 6000).toISOString(), created_by: zed, resource_subtype: "attachment_added", type: "system", text: "attached IMG_0601.JPG" });
  changes.push(`new comment and photo: "${photo.name}"`);

  // 3. Moved to another property section: modified_at doesn't change, only the listing shows it.
  const moved = by("Gutter cleaning");
  const toSection = sectionNamed("23 Sherwood (Vontive) (HG2)");
  moved.memberships = [{ project: { gid: projectGid, name: "HG Capital" }, section: toSection }];
  add(moved.gid, { created_at: new Date(at - 3600_000).toISOString(), created_by: connor, resource_subtype: "section_changed", type: "system", text: `moved this task to ${toSection.name}`, new_section: toSection });
  changes.push(`section move (not in modified_since): "${moved.name}" to ${toSection.name}`);

  // 4. Renamed in Asana; the app renames it too before the replay, so it's a conflict.
  const renamed = by("Paint the hallway");
  const oldName = renamed.name;
  renamed.name = "Paint the hallway and stairs";
  add(renamed.gid, { created_at: new Date(at - 50 * 60_000).toISOString(), created_by: connor, resource_subtype: "name_changed", type: "system", text: "changed the name", old_name: oldName, new_name: renamed.name });
  touch(renamed, at - 50 * 60_000);
  changes.push(`renamed in Asana: "${oldName}" (set its title in the app first for a conflict)`);

  // 5. Rescheduled in Asana: applies.
  const resched = by("Furnace service");
  const newDue = new Date(at + 4 * 86_400_000).toISOString().slice(0, 10);
  add(resched.gid, { created_at: new Date(at - 40 * 60_000).toISOString(), created_by: connor, resource_subtype: "due_date_changed", type: "system", text: `changed the due date to ${newDue}`, old_dates: { due_on: resched.due_on ?? null }, new_dates: { due_on: newDue } });
  resched.due_on = newDue;
  touch(resched, at - 40 * 60_000);
  changes.push(`rescheduled in Asana: "${resched.name}" to ${newDue}`);

  // 6. A new open task with a subtask.
  const fresh: AsanaTask = {
    gid: gid(),
    name: "Replace porch light",
    notes: "Fixture is in the garage.",
    html_notes: "<body>Fixture is in the garage.</body>",
    assignee: users.get(DEFAULT_WORLD.contractors[1].gid) ?? zed,
    created_by: connor,
    created_at: new Date(at - 30 * 60_000).toISOString(),
    modified_at: new Date(at - 30 * 60_000).toISOString(),
    completed: false,
    due_on: new Date(at + 2 * 86_400_000).toISOString().slice(0, 10),
    memberships: [{ project: { gid: projectGid, name: "HG Capital" }, section: sectionNamed("118 Congress (HG)") }],
    parent: null,
    num_subtasks: 1,
    in_project: true,
  };
  tasks.push(fresh, { gid: gid(), name: "Buy bulbs", completed: false, parent: { gid: fresh.gid }, in_project: false, created_at: fresh.created_at, memberships: [] });
  modified.add(fresh.gid);
  changes.push(`new open task: "${fresh.name}" with a subtask`);

  // 7. Moved into Pieter's section: noted as a conflict, the app keeps it.
  const away = by("Order laundry tub");
  away.memberships = [{ project: { gid: projectGid, name: "HG Capital" }, section: sectionNamed("Pieter properties") }];
  changes.push(`moved out of HG sections: "${away.name}"`);

  // 8. A comment on a checklist item (subtask).
  const subtask = tasks.find((t) => t.parent && t.name === "Order grout");
  if (subtask) {
    add(subtask.gid, { created_at: new Date(at - 20 * 60_000).toISOString(), created_by: zed, resource_subtype: "comment_added", type: "comment", text: "Grout is here.", html_text: "<body>Grout is here.</body>" });
    changes.push('comment on the checklist item "Order grout"');
  }

  return {
    meta: { cursor: new Date(Date.parse(snap.manifest.snapshotStartedAt) - 3600_000).toISOString(), startedAt, modified: [...modified], synthetic: true },
    tasks,
    stories,
    attachments,
    files,
    changes,
    appEdit: { gid: renamed.gid, title: "Paint the hallway (2 coats)" },
  };
}
