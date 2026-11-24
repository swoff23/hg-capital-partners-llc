import "server-only";
import { prisma } from "@/lib/db";
import { todayYmdEastern, toYmd, ymdToDate } from "@/lib/dates";
import { sendEmail } from "@/lib/email/send";
import { getEnv } from "@/lib/env";
import { logError } from "@/lib/log";
import { residentHome, updateEmail } from "./emails";
import { liveResidentLink, residentUrl } from "./links";
import { SEND_GAP_MS } from "./service";
import { stepOf } from "./steps";

/**
 * The resident's update emails (docs/specs/maintenance-requests.md, sections 5
 * and 10): scheduled with the day, the day moved, done, or closed with staff's
 * note. Run once a minute by /api/cron/notifications. Rather than a hook in
 * every task write, it compares each request's step with the last one it
 * recorded (`notifiedStep`) and its day with the last day it emailed
 * (`notifiedDay`), once the task has been quiet for three minutes, the task
 * emails' bundling window: a change put back meanwhile sends nothing, and two
 * changes a minute apart send one email.
 *
 * Back to Received (a reopen, or Waiting) is recorded without an email and
 * clears the old close; a Scheduled again on a day already emailed is recorded
 * without one too. A resident's own cancel was recorded when they did it.
 *
 * The email's button opens their live link and never makes one, so a partner's
 * Turn off link sticks; with none it goes to the Residents page, where they can
 * ask for theirs. Sends are spaced for Resend, carry an idempotency key, and stop
 * at a time budget so the cron's other work keeps its minute. A refused address
 * is recorded as sent; anything else is put back for the next minute.
 */

const QUIET_MS = 3 * 60_000;
/** Requests whose last email said Done or Closed are looked at again only while their task moves. */
const RECENT_MS = 30 * 24 * 60 * 60_000;
const TIME_BUDGET_MS = 10_000;

/** A send Resend refused for this message itself (a bad address, a blocked recipient), which a retry won't fix. */
const refusedForGood = (status: number | undefined) => status !== undefined && status >= 400 && status < 500 && status !== 429;

export async function sendResidentUpdates(now = new Date()): Promise<{ sent: number; recorded: number }> {
  const started = Date.now();
  const result = { sent: 0, recorded: 0 };
  const quietSince = new Date(now.getTime() - QUIET_MS);
  // Every candidate, not a page of them: at HG Capital's size this is a few hundred rows at most, and taking the
  // oldest first could leave a new request waiting behind ones that never change.
  const rows = await prisma.residentRequest.findMany({
    where: {
      task: { updatedAt: { lte: quietSince } },
      OR: [{ notifiedStep: { in: ["received", "scheduled"] } }, { task: { updatedAt: { gte: new Date(now.getTime() - RECENT_MS) } } }],
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      leaseId: true,
      tenantId: true,
      whatsWrong: true,
      details: true,
      letUsIn: true,
      pets: true,
      petsNote: true,
      closedNote: true,
      canceledByResidentAt: true,
      notifiedStep: true,
      notifiedDay: true,
      tenant: { select: { email: true } },
      lease: { select: { unitLabel: true, property: { select: { address: true } } } },
      task: { select: { status: true, scheduledFor: true } },
    },
  });
  const today = todayYmdEastern(now);
  let lastSendAt = 0;

  for (const r of rows) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    const step = stepOf(r.task.status, r.task.scheduledFor);
    const day = step === "scheduled" ? toYmd(r.task.scheduledFor) : null;
    const emailedDay = toYmd(r.notifiedDay);
    if (step === r.notifiedStep && (step !== "scheduled" || day === emailedDay)) continue;

    const open = step === "received" || step === "scheduled";
    // Recorded without an email: back to Received, or Scheduled again on the day they were already told.
    const quiet = step === "received" || (step === "scheduled" && !!day && day === emailedDay);
    // Claim the change first (compare-and-set), so an overlapping run never sends it twice; put back if it doesn't go.
    const claimed = await prisma.residentRequest.updateMany({
      where: { id: r.id, notifiedStep: r.notifiedStep, notifiedDay: r.notifiedDay },
      data: {
        notifiedStep: step,
        ...(step === "scheduled" && day ? { notifiedDay: ymdToDate(day) } : {}),
        // Open again: the last close no longer applies (section 2, defaults).
        ...(open && r.notifiedStep === "closed" ? { closedNote: null, canceledByResidentAt: null } : {}),
      },
    });
    if (claimed.count === 0) continue;
    if (quiet || !r.tenant?.email || !r.tenantId) {
      result.recorded++;
      continue;
    }

    const putBack = () =>
      prisma.residentRequest.updateMany({
        where: { id: r.id, notifiedStep: step },
        data: { notifiedStep: r.notifiedStep, notifiedDay: r.notifiedDay, closedNote: r.closedNote, canceledByResidentAt: r.canceledByResidentAt },
      });
    try {
      const link = await liveResidentLink(r.tenantId, r.leaseId);
      const mail = updateEmail({
        step: step as "scheduled" | "done" | "closed",
        moved: step === "scheduled" && !!emailedDay && emailedDay !== day,
        day,
        today,
        whatsWrong: r.whatsWrong,
        home: residentHome(r.lease.property.address, r.lease.unitLabel),
        details: r.details,
        letUsIn: r.letUsIn,
        pets: r.pets,
        petsNote: r.petsNote,
        closedNote: r.closedNote,
        url: link ? residentUrl(link.token, `/${r.id}`) : `${getEnv().appUrl}/residents/maintenance`,
        buttonLabel: link ? undefined : "Get your link",
      });
      const wait = lastSendAt + SEND_GAP_MS - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      lastSendAt = Date.now();
      const sent = await sendEmail({
        to: r.tenant.email,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        idempotencyKey: `resident:${r.id}:${step}:${day ?? ""}`,
      });
      if (sent.ok) {
        result.sent++;
      } else if (refusedForGood(sent.status)) {
        logError("residents:update-email", new Error(`refused: ${sent.code ?? sent.status}`), { requestId: r.id }, { level: "warning" });
        result.recorded++;
      } else {
        await putBack();
      }
    } catch (err) {
      logError("residents:update-email", err, { requestId: r.id }, { level: "warning" });
      await putBack();
    }
  }
  return result;
}
