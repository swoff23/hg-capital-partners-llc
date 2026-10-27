import { notFound } from "next/navigation";
import { after } from "next/server";
import type { TaskStatus } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordView } from "@/lib/recent-views";
import { daysUntil, fmtDay, toYmd, todayYmdEastern } from "@/lib/dates";
import { firstName } from "@/lib/names";
import { propertyOptions } from "@/lib/picker-options";
import { parseUnits } from "@/lib/property-types";
import { buildActivity, easternDay, type ActivityEvent } from "@/lib/tasks/activity";
import { assigneeOptions } from "@/lib/tasks/assignee-options";
import { lockboxState } from "@/lib/tasks/lockbox";
import { parseRepeatRule } from "@/lib/tasks/repeat";
import { copySlot } from "@/lib/tasks/repeat-slot";
import { fileLink, isDraftUpload, isMediaRow, mediaItem, reviewPhotos, taskMedia, taskMediaInclude, type TaskMediaRow } from "@/lib/tasks/media";
import { OVERDUE_ELIGIBLE, STATUS_LABEL, isActiveStatus } from "@/lib/task-scope";
import type { FileLink } from "@/components/files-list";
import type { ActivityRow } from "./activity";
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
      // Posted and drafted files, oldest first (lib/tasks/media.ts).
      attachments: taskMediaInclude,
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
  // Puts it on top of this person's Recent in search, once the response is out.
  after(() => recordView(user.id, "TASK", task.id));

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

  // The Photos section's tiles and rows, and the "At finish" set (lib/tasks/media.ts).
  const { media, files, atFinish } = taskMedia(task.attachments, { events: task.events });
  // My uploads still waiting in the composer: only my own drafts come back to me.
  const drafts = task.attachments
    .filter((a) => isDraftUpload(a) && a.uploadedByUserId === user.id)
    .map((a) => ({ id: a.id, filename: a.filename }));
  const byEvent = new Map<string, TaskMediaRow[]>();
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
    const at = entry.at.toISOString();
    if (entry.type === "due-run") return { type: "due-run", id: entry.id, day, at, text: entry.text };
    const atts = byEvent.get(entry.event.id) ?? [];
    const own = {
      media: atts.filter(isMediaRow).map(mediaItem),
      files: atts.filter((a) => !isMediaRow(a)).map(fileLink).filter((f): f is FileLink => !!f),
    };
    if (entry.type === "line") {
      // A status change carries its new status, for the mark on the rail (choice 3.1 B).
      const to = entry.event.kind === "STATUS" ? (entry.event.data as { to?: unknown } | null)?.to : null;
      const status = typeof to === "string" && to in STATUS_LABEL ? (to as TaskStatus) : null;
      return { type: "line", id: entry.id, day, at, text: entry.text, href: entry.href ?? null, status, ...own };
    }
    const e = entry.event;
    const data = (e.data ?? {}) as { fromChecklistItem?: { title?: string } };
    return {
      type: "comment",
      id: e.id,
      day,
      at,
      author: e.actorLabel,
      isContractor: !!e.actorContactId,
      internal: e.visibility === "INTERNAL",
      onItem: data.fromChecklistItem?.title ?? null,
      body: e.body,
      ...own,
    };
  });

  /* ---------------- Review ---------------- */

  const review = (() => {
    if (task.status !== "REVIEW") return null;
    const marked = [...task.events].reverse().find((e) => e.kind === "STATUS" && (e.data as { to?: string } | null)?.to === "REVIEW");
    const fullName = marked?.actorLabel ?? contractor?.fullName ?? "Someone";
    const contactId = marked?.actorContactId ?? (marked ? null : (contractor?.id ?? null));
    const photos = reviewPhotos(task.attachments, { contactId, events: task.events }).length;
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
      atFinish={atFinish}
      rows={rows}
      now={now.toISOString()}
      drafts={drafts}
    />
  );
}

export const dynamic = "force-dynamic";
