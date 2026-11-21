import type { ResidentStep } from "@/lib/residents/emails";

/** What each step is called on the resident's pages (section 3.4). */
export const STEP_LABEL: Record<ResidentStep, string> = { received: "Received", scheduled: "Scheduled", done: "Done", closed: "Closed" };
