import { fmtDay, type Ymd } from "@/lib/dates";
import { shortAddress } from "@/lib/normalize";
import { homeLabel } from "@/lib/tenants/status";
import { renderResidentEmail, type EmailStep } from "./email-layout";

/**
 * The emails a resident gets (docs/specs/maintenance-requests.md, section 5),
 * in the resident layout (email-layout.ts; drawing 15 B): "What's new" and its
 * headline, their three steps, a line, the button, then "Your request" as
 * labeled rows. Pure: the callers send them (links, the submit action,
 * updates.ts). Every one ends with where questions go, since replies aren't
 * read.
 */

export const GROUP_CHAT_LINE = "Questions? Text us in our group chat.";

export interface ResidentEmail {
  subject: string;
  text: string;
  html: string;
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

/** Their link, from the tenant sheet or the launch-day send, and again from Email me my link. No news, so no steps or request. */
export function linkEmail(input: { firstName: string; home: string; url: string }): ResidentEmail {
  const r = renderResidentEmail({
    preview: `From now on, send repairs for ${input.home} here.`,
    kicker: null,
    headline: `Hi ${input.firstName}, here's your maintenance request link`,
    lines: [`From now on, send repairs for ${input.home} here. You'll see when each one is scheduled and done.`, "Save it to your home screen."],
    button: { label: "Report a problem", url: input.url },
    footnote: "Emergency? Text us in our group chat.",
  });
  return { subject: "Your maintenance request link", ...r };
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
  return { subject: `Your request: ${input.whatsWrong}`, ...r };
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
  return { subject, ...r };
}
