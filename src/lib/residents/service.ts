import "server-only";
import { prisma } from "@/lib/db";
import { todayYmdEastern } from "@/lib/dates";
import { sendEmail } from "@/lib/email/send";
import { logError } from "@/lib/log";
import { firstName } from "@/lib/names";
import { linkLeaseEnded } from "./steps";
import { linkEmail, residentHome } from "./emails";
import { ResidentLinkError, currentResidentLink, markResidentLinkEmailed, residentUrl, type LinkState } from "./links";

/**
 * Sending request links (docs/specs/maintenance-requests.md, sections 3.7,
 * 4.4 and 4.5): one person from their sheet, everyone on launch day, and a
 * resident who asks the Residents page for theirs again.
 */

/** Email one person their link. Refused with one line when there's no email on file or the lease has ended. */
export async function emailResidentLink(tenantId: string, leaseId: string, now = new Date()): Promise<LinkState> {
  const who = await prisma.leaseTenant.findUnique({
    where: { leaseId_tenantId: { leaseId, tenantId } },
    select: { tenant: { select: { fullName: true, email: true } }, lease: { select: { unitLabel: true, property: { select: { address: true } } } } },
  });
  if (!who) throw new ResidentLinkError("They aren't on this lease anymore.");
  const first = firstName(who.tenant.fullName) || who.tenant.fullName;
  if (!who.tenant.email) throw new ResidentLinkError(`Add an email for ${first} first, or copy the link.`);
  const link = await currentResidentLink(tenantId, leaseId, now);
  const email = linkEmail({ firstName: first, home: residentHome(who.lease.property.address, who.lease.unitLabel), url: residentUrl(link.token) });
  const sent = await sendEmail({ to: who.tenant.email, subject: email.subject, text: email.text, html: email.html });
  if (!sent.ok) throw new ResidentLinkError(`The email to ${first} didn't send. Try again.`);
  await markResidentLinkEmailed(link.token, now);
  return { ...link, emailedAt: now };
}

/** Who the launch-day send reaches: everyone on a current or upcoming lease with an email and no emailed link yet. */
export async function launchSendPlan(now = new Date()): Promise<{ send: { tenantId: string; leaseId: string }[]; noEmail: number; already: number }> {
  const today = todayYmdEastern(now);
  const leases = await prisma.lease.findMany({
    select: {
      id: true,
      movesIn: true,
      movesOut: true,
      tenants: { select: { tenantId: true, tenant: { select: { email: true } } } },
      residentLinks: { where: { revokedAt: null, emailedAt: { not: null } }, select: { tenantId: true } },
    },
  });
  const send: { tenantId: string; leaseId: string }[] = [];
  let noEmail = 0;
  let already = 0;
  for (const l of leases) {
    if (linkLeaseEnded(l, today)) continue;
    const emailed = new Set(l.residentLinks.map((r) => r.tenantId));
    for (const t of l.tenants) {
      if (emailed.has(t.tenantId)) already++;
      else if (!t.tenant.email?.trim()) noEmail++;
      else send.push({ tenantId: t.tenantId, leaseId: l.id });
    }
  }
  return { send, noEmail, already };
}

/** Resend takes two emails a second; the outbox keeps the same gap (notifications/outbox.ts SEND_GAP_MS). */
export const SEND_GAP_MS = 600;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The launch-day send: each person in the plan gets their own link, spaced for Resend. Says how many went and how many didn't. */
export async function sendLaunchLinks(now = new Date()): Promise<{ sent: number; failed: number }> {
  const { send } = await launchSendPlan(now);
  let sent = 0;
  let failed = 0;
  for (const [i, p] of send.entries()) {
    if (i > 0) await pause(SEND_GAP_MS);
    try {
      await emailResidentLink(p.tenantId, p.leaseId, now);
      sent++;
    } catch (err) {
      failed++;
      logError("residents:launch-send", err, { tenantId: p.tenantId, leaseId: p.leaseId }, { level: "warning" });
    }
  }
  return { sent, failed };
}

/**
 * Email me my link (section 3.7): every current person on file with this
 * email gets their live link. Says nothing about whether anyone matched; the
 * page shows the same line either way.
 */
export async function emailLinkToAddress(email: string, now = new Date()): Promise<void> {
  const today = todayYmdEastern(now);
  const people = await prisma.leaseTenant.findMany({
    where: { tenant: { email: { equals: email.trim(), mode: "insensitive" } } },
    select: { tenantId: true, leaseId: true, lease: { select: { movesIn: true, movesOut: true } } },
  });
  for (const p of people) {
    if (linkLeaseEnded(p.lease, today)) continue;
    try {
      await emailResidentLink(p.tenantId, p.leaseId, now);
    } catch (err) {
      logError("residents:email-my-link", err, { tenantId: p.tenantId }, { level: "warning" });
    }
  }
}
