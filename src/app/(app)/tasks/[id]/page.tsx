import { notFound } from "next/navigation";
import { after } from "next/server";
import type { TaskStatus } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logError } from "@/lib/log";
import { recordView } from "@/lib/recent-views";
import { daysUntil, fmtDay, toYmd, todayYmdEastern } from "@/lib/dates";
import { firstName } from "@/lib/names";
import { propertyOptions } from "@/lib/picker-options";
import { parseUnits } from "@/lib/property-types";
import { easternDay } from "@/lib/tasks/activity";
import { assigneeOptions } from "@/lib/tasks/assignee-options";
import { asanaProfileGids, asanaTaskGids, taskIdsIn } from "@/lib/tasks/body-links";
import { emailStatesIn } from "@/lib/tasks/delivery";
import { lockboxState } from "@/lib/tasks/lockbox";
import { lastSeen, markTaskSeen, otherPartnersSeen, seenBaseline } from "@/lib/tasks/read-state";
import { parseRepeatRule } from "@/lib/tasks/repeat";
import { copySlot } from "@/lib/tasks/repeat-slot";
import { isDraftUpload, mediaItem, reviewPhotos, taskMedia, taskMediaInclude } from "@/lib/tasks/media";
import { OVERDUE_ELIGIBLE, excludeTemplateTasks, isActiveStatus } from "@/lib/task-scope";
import { shapeActivity } from "./activity-rows";
import type { ReviewDecision, ReviewProof } from "./review-banner";
import { TaskPageView } from "./view";
import type { Metadata } from "next";
import { recordMetadata } from "@/lib/record-metadata";

/** The tab names the record (record-title.ts), so tabs and history can be told apart. */
export async function generateMetadata({ params }: PageProps<"/tasks/[id]">): Promise<Metadata> {
  return recordMetadata("task", (await params).id);
}

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
      asanaSyncedAt: true,
      propertyId: true,
      assigneeUserId: true,
      assigneeContactId: true,
      assigneeName: true,
      createdBy: { select: { name: true, email: true } },
      assigneeContact: { select: { id: true, fullName: true, active: true } },
      // Who can open the job right now: the delivery line only speaks for a contractor who still can.
      access: { where: { revokedAt: null }, select: { contactId: true } },
      checklist: { orderBy: [{ position: "asc" }, { createdAt: "asc" }], select: { id: true, title: true, done: true } },
      // Posted and drafted files, oldest first (lib/tasks/media.ts).
      attachments: taskMediaInclude,
      // Deleted comments stay for their staff-only line; every other deleted event (an undone approval) is left out below.
      events: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          kind: true,
          visibility: true,
          actorLabel: true,
          actorUserId: true,
          actorContactId: true,
          audienceContactId: true,
          body: true,
          data: true,
          source: true,
          asanaStoryGid: true,
          editedAt: true,
          deletedAt: true,
          createdAt: true,
        },
      },
    },
  });
  if (!task) notFound();
  const now = new Date();
  // Puts it on top of this person's Recent in search, and notes the open for the New divider and the unread dot,
  // once the response is out. The previous open is read first (below): it is the divider's baseline.
  after(() => recordView(user.id, "TASK", task.id));
  after(() => markTaskSeen(user.id, task.id, now).catch((err) => logError("tasks:seen", err, { taskId: task.id })));

  const live = task.events.filter((e) => !e.deletedAt);
  const commentBodies = live.filter((e) => e.kind === "COMMENT" && e.body).map((e) => e.body!);
  const pathIds = [...new Set(commentBodies.flatMap(taskIdsIn))];
  const asanaGids = [...new Set(commentBodies.flatMap(asanaTaskGids))];
  const profileGids = [...new Set(commentBodies.flatMap(asanaProfileGids))];
  const contactId = task.assigneeContactId;
  // The newest staff messages the contractor could have been emailed about: what the delivery line and the edit field read.
  const emailed = live
    .filter((e) => (e.kind === "COMMENT" || e.kind === "STATUS" || e.kind === "ATTACHMENT") && e.visibility === "SHARED" && e.actorContactId === null && e.source === "APP")
    .slice(-40)
    .map((e) => e.id);

  const [{ users, contractors, recent }, staff, properties, propertyRow, repeatSlot, previouslySeen, partnersSeen, contractorSeen, linked, people, emailStates] =
    await Promise.all([
      // Recent: the people this viewer assigned last, for the assignee picker.
      assigneeOptions([task.assigneeContactId], user.id),
      // Who can sign in as staff: the people an Internal note is for.
      prisma.user.findMany({ where: { passwordHash: { not: null } }, orderBy: { name: "asc" }, select: { id: true, name: true, email: true } }),
      // Every building as the pickers offer it: unit labels only, in street order.
      propertyOptions(),
      // The lockbox state reads this task's own property's units, which stay on the server.
      task.propertyId ? prisma.property.findUnique({ where: { id: task.propertyId }, select: { units: true } }) : null,
      // The date the series gave this task when it is a repeat copy, so the repeat menu's "Next:" steps from it
      // as finishing does, not from wherever the copy was moved. Reads the same lines core.ts repeatSlot reads.
      copySlot(prisma, task.id, task.events.find((e) => e.kind === "CREATED")?.data),
      // When I last opened it, before this visit.
      lastSeen(user.id, task.id),
      otherPartnersSeen(user.id, task.id),
      contactId ? prisma.taskReadState.findUnique({ where: { taskId_contactId: { taskId: task.id, contactId } }, select: { lastSeenAt: true } }) : null,
      // The tasks and Asana links the comments point at, by title and by import.
      pathIds.length || asanaGids.length
        ? prisma.task.findMany({
            where: { ...excludeTemplateTasks, OR: [{ id: { in: pathIds } }, { asanaId: { in: asanaGids } }] },
            select: { id: true, title: true, asanaId: true },
          })
        : [],
      // The people the import matched, for an Asana profile link in a comment.
      profileGids.length
        ? Promise.all([
            prisma.user.findMany({ where: { asanaGid: { in: profileGids } }, select: { asanaGid: true, name: true, email: true } }),
            prisma.contact.findMany({ where: { asanaGid: { in: profileGids } }, select: { asanaGid: true, fullName: true } }),
          ])
        : null,
      contactId && emailed.length ? emailStatesIn(prisma, task.id, contactId, emailed) : new Map(),
    ]);

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
  const staffFirstNames = staff.map((u) => firstName(userName(u)) || userName(u));

  /* ---------------- Files ---------------- */

  // The Photos section's tiles and rows, and the "At finish" set (lib/tasks/media.ts).
  const { media, files, atFinish } = taskMedia(task.attachments, { events: live });
  // My uploads still waiting in the composer: only my own drafts come back to me.
  const drafts = task.attachments
    .filter((a) => isDraftUpload(a) && a.uploadedByUserId === user.id)
    .map((a) => ({ id: a.id, filename: a.filename }));

  /* ---------------- Activity ---------------- */

  const names = {
    users: Object.fromEntries(users.map((u) => [u.id, userName(u)])),
    contacts: Object.fromEntries(contractors.map((c) => [c.id, c.name])),
    properties: Object.fromEntries(properties.map((p) => [p.id, p.label])),
  };
  const taskTitles = Object.fromEntries(linked.map((t) => [t.id, t.title]));
  const asanaTasks = Object.fromEntries(linked.flatMap((t) => (t.asanaId ? [[t.asanaId, t.id] as const] : [])));
  const asanaPeople = Object.fromEntries([
    ...(people?.[0] ?? []).flatMap((u) => (u.asanaGid ? [[u.asanaGid, userName(u)] as const] : [])),
    ...(people?.[1] ?? []).flatMap((c) => (c.asanaGid ? [[c.asanaGid, c.fullName] as const] : [])),
  ]);
  const staffById = new Map(staff.map((u) => [u.id, firstName(userName(u)) || userName(u)]));
  const rows = shapeActivity({
    events: task.events,
    attachments: task.attachments,
    names,
    today,
    viewerId: user.id,
    contractor:
      contractor && contactId
        ? {
            id: contractor.id,
            first: contractorFirst ?? contractor.fullName,
            hasLogin: contractorHasLogin,
            accessActive: task.access.some((a) => a.contactId === contactId),
            seenAt: contractorSeen?.lastSeenAt ?? null,
          }
        : null,
    emailStates,
    partnersSeen: partnersSeen.map((p) => ({ first: staffById.get(p.userId) ?? "Someone", at: p.lastSeenAt })),
    links: { taskTitles, asanaTasks, asanaPeople },
    movedOn: task.asanaSyncedAt ? easternDay(task.asanaSyncedAt) : null,
  });
  // Where "New" sits: everything someone else wrote since I last opened it, or since the release for a first open.
  const newSince = seenBaseline(previouslySeen).toISOString();
  const sentClientIds = rows.flatMap((r) => r.clientIds);

  /* ---------------- Review ---------------- */

  // The latest move to Review (an approval that was undone has its Done line deleted, so this is still the contractor's).
  const marked = [...live].reverse().find((e) => e.kind === "STATUS" && (e.data as { to?: string } | null)?.to === "REVIEW");
  const review: ReviewProof | null = (() => {
    if (task.status !== "REVIEW") return null;
    const fullName = marked?.actorLabel ?? contractor?.fullName ?? "Someone";
    const markedBy = marked?.actorContactId ?? (marked ? null : (contractor?.id ?? null));
    // The words written with Mark done: the comment tied to that move by id, or on older jobs the contractor's
    // comment written just before it.
    const note = marked
      ? (live.find((e) => e.kind === "COMMENT" && (e.data as { statusEventId?: string } | null)?.statusEventId === marked.id) ??
        [...live]
          .reverse()
          .find(
            (e) =>
              e.kind === "COMMENT" &&
              e.actorContactId !== null &&
              e.actorContactId === marked.actorContactId &&
              e.createdAt <= marked.createdAt &&
              marked.createdAt.getTime() - e.createdAt.getTime() <= MARK_DONE_WINDOW_MS,
          ))
      : null;
    return {
      name: firstName(fullName) || fullName,
      fullName,
      isContractor: !!markedBy,
      markedAt: (marked?.createdAt ?? now).toISOString(),
      note: note?.body?.trim() || null,
      photos: reviewPhotos(task.attachments, { contactId: markedBy, events: live }).map(mediaItem),
      checklist: task.checklist.length ? { done: task.checklist.filter((c) => c.done).length, total: task.checklist.length } : null,
    };
  })();
  // After a decision, while nothing has moved since: who made it, for the banner's one-line outcome.
  const decision: ReviewDecision | null = (() => {
    if (task.status !== "DONE" && task.status !== "IN_PROGRESS") return null;
    const last = [...live].reverse().find((e) => e.kind === "STATUS");
    const data = (last?.data ?? {}) as { from?: string; to?: string };
    if (!last || data.from !== "REVIEW" || data.to !== task.status) return null;
    return { status: task.status, name: firstName(last.actorLabel) || last.actorLabel, at: last.createdAt.toISOString() };
  })();

  const createdBy = task.createdBy ? firstName(userName(task.createdBy)) || userName(task.createdBy) : null;
  const created = [createdBy, fmtDay(easternDay(task.createdAt), { year: "auto", now: today })].filter(Boolean).join(" · ");

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
      meName={userName(user)}
      recent={recent}
      repeatSlot={repeatSlot}
      lockbox={lockbox}
      created={created}
      contractorFirst={contractorFirst}
      contractorHasLogin={contractorHasLogin}
      contractor={contractor ? { id: contractor.id, first: contractorFirst ?? contractor.fullName, hasLogin: contractorHasLogin } : null}
      staffFirstNames={staffFirstNames}
      review={review}
      decision={decision}
      checklist={task.checklist}
      media={media}
      files={files}
      atFinish={atFinish}
      rows={rows}
      newSince={newSince}
      sentClientIds={sentClientIds}
      now={now.toISOString()}
      drafts={drafts}
    />
  );
}

/** A contractor's Mark done note is written within this long of the move to Review (tasks/media.ts latestMarkDone). */
const MARK_DONE_WINDOW_MS = 30_000;

export const dynamic = "force-dynamic";
