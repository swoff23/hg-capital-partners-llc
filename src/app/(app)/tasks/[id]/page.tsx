import { notFound } from "next/navigation";
import type { TaskStatus } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { MediaItem } from "@/components/media-grid";
import { taskFileUrl } from "@/lib/attachments/media";
import { daysUntil, fmtDay, toYmd, todayYmdEastern } from "@/lib/dates";
import { firstName } from "@/lib/names";
import { propertyOptions } from "@/lib/picker-options";
import { parseUnits } from "@/lib/property-types";
import { buildActivity, dayLabel, easternDay, fmtAgo, type ActivityEvent } from "@/lib/tasks/activity";
import { assigneeOptions } from "@/lib/tasks/assignee-options";
import { lockboxState } from "@/lib/tasks/lockbox";
import { parseRepeatRule } from "@/lib/tasks/repeat";
import { copySlot } from "@/lib/tasks/repeat-slot";
import { OVERDUE_ELIGIBLE, isActiveStatus } from "@/lib/task-scope";
import type { ActivityRow } from "./activity";
import type { FileLink } from "./files-list";
import { TaskPageView } from "./view";

/**
 * The staff task page: loads the task and shapes it for TaskPageView
 * (./view.tsx), which lays it out. Lockbox codes and password hashes never
 * reach the client; only unit labels and a lockbox state do.
 */
export default async function TaskPage({ params }: PageProps<"/tasks/[id]">) {
  const user = await requireUser();
  const { id } = await params;

  const task = await prisma.task.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      dueDate: true,
      scheduledFor: true,
      waitingOn: true,
      unitLabel: true,
      repeatRule: true,
      createdAt: true,
      propertyId: true,
      assigneeUserId: true,
      assigneeContactId: true,
      assigneeName: true,
      createdBy: { select: { name: true, email: true } },
      assigneeContact: { select: { id: true, fullName: true, active: true } },
      checklist: { orderBy: [{ position: "asc" }, { createdAt: "asc" }], select: { id: true, title: true, done: true } },
      attachments: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          kind: true,
          filename: true,
          size: true,
          linkUrl: true,
          visibility: true,
          thumbPathname: true,
          posterPathname: true,
          durationSec: true,
          eventId: true,
          asanaGid: true,
          createdAt: true,
          uploadedByUserId: true,
          uploadedByContactId: true,
          uploadedByUser: { select: { name: true, email: true } },
          uploadedByContact: { select: { fullName: true } },
        },
      },
      events: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          kind: true,
          visibility: true,
          actorLabel: true,
          actorUserId: true,
          actorContactId: true,
          body: true,
          data: true,
          createdAt: true,
        },
      },
    },
  });
  if (!task) notFound();

  const [{ users, contractors, recent }, staff, properties, propertyRow, repeatSlot] = await Promise.all([
    // Recent: the people this viewer assigned last, for the assignee picker.
    assigneeOptions([task.assigneeContactId], user.id),
    // Who can sign in as staff: the people an Internal note is for.
    prisma.user.findMany({ where: { passwordHash: { not: null } }, orderBy: { name: "asc" }, select: { name: true, email: true } }),
    // Every building as the pickers offer it: unit labels only, in street order.
    propertyOptions(),
    // The lockbox state reads this task's own property's units, which stay on the server.
    task.propertyId ? prisma.property.findUnique({ where: { id: task.propertyId }, select: { units: true } }) : null,
    // The date the series gave this task when it is a repeat copy, so the repeat menu's "Next:" steps from it
    // as finishing does, not from wherever the copy was moved. Reads the same lines core.ts repeatSlot reads.
    copySlot(prisma, task.id, task.events.find((e) => e.kind === "CREATED")?.data),
  ]);

  const now = new Date();
  const today = todayYmdEastern(now);
  const active = isActiveStatus(task.status);
  const due = toYmd(task.dueDate);
  const overdue = (OVERDUE_ELIGIBLE as readonly TaskStatus[]).includes(task.status) && (daysUntil(due, today) ?? 0) < 0;
  const contractor = task.assigneeContact;
  const contractorFirst = contractor ? firstName(contractor.fullName) || contractor.fullName : null;
  // Whether that contractor has a login (G2B-I03): the picker's own "Has login"
  // flag (status ACTIVE), the same rule core.ts emails by, and only while the
  // contact is active, since sign-in refuses an inactive one (the card's Access
  // off). Nothing else about the account is read.
  const contractorHasLogin = !!contractor?.active && contractors.some((c) => c.id === contractor.id && c.hasLogin);
  const property = propertyRow;

  const lockbox = (() => {
    if (!contractorFirst || !property || !active) return null;
    const state = lockboxState(parseUnits(property.units), task.unitLabel);
    return state === "none" ? null : { state, contractor: contractorFirst, hasLogin: contractorHasLogin };
  })();

  const userName = (u: { name: string | null; email: string }) => u.name || u.email;
  const staffFirstNames = staff.map((u) => firstName(userName(u)));
  const staffNames = staffFirstNames.length ? staffFirstNames.join(" and ") : "staff";

  /* ---------------- Files ---------------- */

  type Att = (typeof task.attachments)[number];
  const uploaderOf = (a: Att) => (a.uploadedByUser ? userName(a.uploadedByUser) : (a.uploadedByContact?.fullName ?? null));
  const asMedia = (a: Att): MediaItem => ({
    id: a.id,
    kind: a.kind as "IMAGE" | "VIDEO",
    filename: a.filename,
    hasThumb: !!a.thumbPathname,
    hasPoster: !!a.posterPathname,
    durationSec: a.durationSec,
    uploadedBy: uploaderOf(a),
    createdAt: a.createdAt,
    internal: a.visibility === "INTERNAL",
  });
  const asFile = (a: Att): FileLink | null => {
    if (a.kind === "LINK") return a.linkUrl ? { id: a.id, kind: "LINK", filename: a.filename, href: a.linkUrl, size: null, internal: a.visibility === "INTERNAL" } : null;
    return { id: a.id, kind: "FILE", filename: a.filename, href: taskFileUrl(a.id), size: a.size, internal: a.visibility === "INTERNAL" };
  };
  const isMedia = (a: Att) => a.kind === "IMAGE" || a.kind === "VIDEO";
  // A staff upload still waiting in someone's composer: not on any comment
  // yet, and Internal until Send. It shows only in that person's composer,
  // so a reload or another visit picks it back up instead of orphaning it.
  const isDraft = (a: Att) => a.eventId === null && a.asanaGid === null && a.uploadedByUserId !== null;
  const posted = task.attachments.filter((a) => !isDraft(a));
  const drafts = task.attachments.filter((a) => isDraft(a) && a.uploadedByUserId === user.id).map((a) => ({ id: a.id, filename: a.filename }));
  const media = posted.filter(isMedia).map(asMedia);
  const files = posted.filter((a) => !isMedia(a)).map(asFile).filter((f): f is FileLink => !!f);
  const byEvent = new Map<string, Att[]>();
  for (const a of task.attachments) if (a.eventId) byEvent.set(a.eventId, [...(byEvent.get(a.eventId) ?? []), a]);

  /* ---------------- Activity ---------------- */

  const names = {
    users: Object.fromEntries(users.map((u) => [u.id, userName(u)])),
    contacts: Object.fromEntries(contractors.map((c) => [c.id, c.name])),
    properties: Object.fromEntries(properties.map((p) => [p.id, p.label])),
  };
  const events: ActivityEvent[] = task.events;
  const rows: ActivityRow[] = buildActivity(events, names, today).map((entry): ActivityRow => {
    const day = easternDay(entry.at);
    const ago = fmtAgo(entry.at, now);
    if (entry.type === "due-run") return { type: "due-run", id: entry.id, day, ago, text: entry.text };
    const atts = byEvent.get(entry.event.id) ?? [];
    const own = {
      media: atts.filter(isMedia).map(asMedia),
      files: atts.filter((a) => !isMedia(a)).map(asFile).filter((f): f is FileLink => !!f),
    };
    if (entry.type === "line") return { type: "line", id: entry.id, day, ago, text: entry.text, href: entry.href ?? null, ...own };
    const e = entry.event;
    const data = (e.data ?? {}) as { fromChecklistItem?: { title?: string } };
    return {
      type: "comment",
      id: e.id,
      day,
      ago,
      author: e.actorLabel,
      isContractor: !!e.actorContactId,
      internal: e.visibility === "INTERNAL",
      onItem: data.fromChecklistItem?.title ?? null,
      body: e.body,
      ...own,
    };
  });
  const dayLabels = Object.fromEntries([...new Set(rows.map((r) => r.day))].map((d) => [d, dayLabel(d, today)]));

  /* ---------------- Review ---------------- */

  const review = (() => {
    if (task.status !== "REVIEW") return null;
    const marked = [...task.events].reverse().find((e) => e.kind === "STATUS" && (e.data as { to?: string } | null)?.to === "REVIEW");
    const fullName = marked?.actorLabel ?? contractor?.fullName ?? "Someone";
    const contactId = marked?.actorContactId ?? (marked ? null : (contractor?.id ?? null));
    const photos = contactId ? task.attachments.filter((a) => isMedia(a) && a.uploadedByContactId === contactId).length : 0;
    return { fullName, name: firstName(fullName) || fullName, isContractor: !!contactId, photos };
  })();

  const createdBy = task.createdBy ? firstName(userName(task.createdBy)) || userName(task.createdBy) : null;
  const created = [createdBy, fmtDay(easternDay(task.createdAt), { year: "auto", now: today })].filter(Boolean).join(" \u00b7 ");

  return (
    <TaskPageView
      task={{
        id: task.id,
        title: task.title,
        description: task.description,
        status: task.status,
        waitingOn: task.waitingOn,
        legacyAssignee: !task.assigneeUserId && !task.assigneeContactId ? task.assigneeName : null,
      }}
      today={today}
      active={active}
      overdue={overdue}
      values={{
        assignee: task.assigneeUserId
          ? { userId: task.assigneeUserId }
          : task.assigneeContactId
            ? { contactId: task.assigneeContactId }
            : null,
        dueDate: due,
        scheduledFor: toYmd(task.scheduledFor),
        propertyId: task.propertyId,
        unitLabel: task.unitLabel,
        repeatRule: parseRepeatRule(task.repeatRule),
      }}
      users={users}
      contractors={contractors}
      properties={properties}
      meId={user.id}
      recent={recent}
      repeatSlot={repeatSlot}
      lockbox={lockbox}
      created={created}
      contractorFirst={contractorFirst}
      contractorHasLogin={contractorHasLogin}
      staffNames={staffNames}
      review={review}
      checklist={task.checklist}
      media={media}
      files={files}
      rows={rows}
      dayLabels={dayLabels}
      drafts={drafts}
    />
  );
}

export const dynamic = "force-dynamic";
