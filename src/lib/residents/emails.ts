import { BRAND } from "@/lib/brand";
import { fmtDay, type Ymd } from "@/lib/dates";
import { renderPlainEmail } from "@/lib/email/render";
import { shortAddress } from "@/lib/normalize";
import { homeLabel } from "@/lib/tenants/status";
import { renderResidentEmail, type EmailStep } from "./email-layout";

/**
 * The emails a resident gets (docs/specs/maintenance-requests.md, section 5;
 * the form email, docs/specs/tenant-welcome-email.md), in the resident layout
 * (email-layout.ts; drawing 15 B): "What's new" and its headline, their three
 * steps, a line, the button, then "Your request" as labeled rows. Pure: the
 * callers send them (links, the submit action, updates.ts, the move-in form)
 * with each one's `fromName`, and give each its own reply address
 * (reply-address.ts) so a reply reaches the app. Every one still ends with
 * where questions go: the group chat.
 */

export const GROUP_CHAT_LINE = "Questions? Text us in our group chat.";

/** Every email to a resident is from "HG Capital" (tenant-welcome-email.md, Q4), never "via". */
export const RESIDENT_FROM = BRAND.app;

export interface ResidentEmail {
  subject: string;
  text: string;
  html: string;
  fromName: string;
}

/** The step a resident sees (section 3.4). Review stays Scheduled until it's Done. */
export type ResidentStep = "received" | "scheduled" | "done" | "closed";

/** "56 Tamarack St · Upper": the street and unit, as the resident's pages show them. */
export function residentHome(address: string, unitLabel: string | null): string {
  return homeLabel(shortAddress(address), unitLabel);
}

/** The steps as the email draws them, the same three as their request page; a closed request ends at Closed. */
export function emailSteps(step: ResidentStep): EmailStep[] {
  const at = (label: string, reached: boolean, current: boolean): EmailStep => ({ label, reached, current });
  if (step === "closed") return [at("Received", true, false), at("Closed", true, true)];
  return [
    at("Received", true, step === "received"),
    at("Scheduled", step === "scheduled" || step === "done", step === "scheduled"),
    at("Done", step === "done", step === "done"),
  ];
}

interface RequestFacts {
  whatsWrong: string;
  home: string;
  details: string | null;
  letUsIn: boolean;
  pets: boolean | null;
  petsNote: string | null;
}

/** "Your request": their words as the title, the home, and the answers as labeled rows. */
function requestBlock(r: RequestFacts) {
  const facts: { label: string; value: string }[] = [{ label: "Entry", value: r.letUsIn ? "You can come in" : "Coordinate when you're home" }];
  if (r.letUsIn && r.pets) facts.push({ label: "Pets", value: r.petsNote?.trim() || "Yes" });
  if (r.details?.trim()) facts.push({ label: "Comments", value: r.details.trim() });
  return { title: r.whatsWrong, where: r.home, facts };
}

/**
 * Their maintenance request form (docs/specs/tenant-welcome-email.md, Q1 and Q3), from the tenant sheet, the
 * launch-day send and Email me my link: one email for every send, so it's still true whenever they find it. The
 * button opens the form itself. A new tenant (newTenant: move-in in the last 30 days or still ahead) is welcomed;
 * a link sent to replace one that no longer works says so, whoever they are.
 */
export function linkEmail(input: { firstName: string; home: string; url: string; replaced?: boolean; welcome?: boolean }): ResidentEmail {
  // Short and sweet (Connor, Nov 24): one line, the button, the emergency line. The request copy says what happens next.
  const first = input.replaced ? "Your old link no longer works. Use this one from now on." : "Use it for all maintenance requests.";
  const headline = input.replaced
    ? `Hi ${input.firstName}, here's your new maintenance request form.`
    : input.welcome
      ? `Welcome, ${input.firstName}. Here's your maintenance request form.`
      : `Hi ${input.firstName}, here's your maintenance request form.`;
  const r = renderResidentEmail({
    preview: first,
    kicker: null,
    headline,
    lines: [first],
    button: { label: "Report a problem", url: input.url },
    footnote: "Emergency? Text us in our group chat.",
  });
  return { subject: `Your ${input.replaced ? "new " : ""}maintenance request form for ${input.home}`, fromName: RESIDENT_FROM, ...r };
}

/** Their copy of what they sent (section 3.3): Received, and what happens next. */
export function requestCopyEmail(input: RequestFacts & { firstName: string; url: string }): ResidentEmail {
  const line = "We'll email you when it's scheduled.";
  const r = renderResidentEmail({
    preview: `${input.whatsWrong}. ${line}`,
    kicker: "What's new",
    headline: `Thanks, ${input.firstName}. We got your request`,
    steps: emailSteps("received"),
    lines: [line],
    button: { label: "See your request", url: input.url },
    request: requestBlock(input),
    footnote: GROUP_CHAT_LINE,
  });
  return { subject: `Your request: ${input.whatsWrong}`, fromName: RESIDENT_FROM, ...r };
}

/** One update: scheduled, moved, done or closed. */
export function updateEmail(
  input: RequestFacts & {
    step: Exclude<ResidentStep, "received">;
    /** Scheduled: the first time it got a day. Moved: the day changed while scheduled. */
    moved: boolean;
    day: Ymd | null;
    today: Ymd;
    closedNote: string | null;
    url: string;
    /** With no live link to open (turned off), the button goes to the Residents page as "Get your link". */
    buttonLabel?: string;
  },
): ResidentEmail {
  const day = input.day ? fmtDay(input.day, { weekday: true, year: "auto", now: input.today }) : null;
  let subject: string;
  let headline: string;
  const lines: string[] = [];
  if (input.step === "scheduled") {
    // A job moved to Scheduled with no day yet (rare) says it's scheduled, and the day's email follows.
    subject = day ? `${input.moved ? "Moved to" : "Scheduled for"} ${day}: ${input.whatsWrong}` : `Scheduled: ${input.whatsWrong}`;
    headline = day ? `${input.moved ? "Moved to" : "Scheduled for"} ${day}` : "Scheduled";
    lines.push(input.letUsIn ? "We'll let the contractor in, since you said that's okay." : "We'll coordinate a time when you're home.");
  } else if (input.step === "done") {
    subject = `Done: ${input.whatsWrong}`;
    headline = "Done";
  } else {
    subject = `Closed: ${input.whatsWrong}`;
    headline = "Closed";
    if (input.closedNote?.trim()) lines.push(input.closedNote.trim());
  }
  const r = renderResidentEmail({
    preview: [input.whatsWrong, ...lines].join(". "),
    kicker: "What's new",
    headline,
    steps: emailSteps(input.step),
    lines,
    button: { label: input.buttonLabel ?? "See your request", url: input.url },
    request: requestBlock(input),
    footnote: GROUP_CHAT_LINE,
  });
  return { subject, fromName: RESIDENT_FROM, ...r };
}

/**
 * The move-in report's copy to whoever sent it (PUBLIC-046), in the one plain layout. Only the report's own lines go,
 * nothing from the app. The footnote names "HG Capital" and stays one line at 320 for every date (183px of 230 on
 * the widest, "May 30"); "through the HG Capital residents page" wrapped on every phone.
 */
export function moveInCopyEmail(input: { name: string; firstName: string; where: string; lines: readonly string[]; today: Ymd; appUrl: string }): ResidentEmail {
  const r = renderPlainEmail({
    line: `Thanks, ${input.firstName || input.name}. Here's a copy of the move-in report you sent for ${input.where}.`,
    items: input.lines.map((l) => l.trim()).filter(Boolean),
    closing: "We'll follow up if anything needs attention.",
    buttonLabel: "Moving in",
    buttonUrl: `${input.appUrl}/residents/moving-in`,
    footnote: `Sent to ${BRAND.app} on ${fmtDay(input.today, { year: "auto", now: input.today })}.`,
  });
  return { subject: `Your move-in report for ${input.where}`, fromName: RESIDENT_FROM, ...r };
}
