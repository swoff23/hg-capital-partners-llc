/**
 * Contractor onboarding's one set of rules (docs/specs/contractor-onboarding.md): who is in setup, which step
 * they're on, and the status the Contractors list, the contractor's page, Home and the filter all show. Pure; see
 * onboarding.test.ts.
 *
 * Only people who came in by a personal invite or the shared sign-up link are ever in setup. Everyone staff added,
 * and every contact from before onboarding, is STAFF: no badge, no steps, no card (decision 5).
 */

import type { PortalAccessState } from "@/lib/portal/access-state";

export type SignupSourceValue = "STAFF" | "INVITE" | "LINK";

/** New (a sign-up from the shared link, not kept yet), Invited, Opened, Onboarding. Null is Active, or never in setup. */
export type OnboardingStatus = "new" | "invited" | "opened" | "onboarding";

export const ONBOARDING_STATUSES: readonly OnboardingStatus[] = ["new", "invited", "opened", "onboarding"];

export const ONBOARDING_LABEL: Record<OnboardingStatus, string> = {
  new: "New",
  invited: "Invited",
  opened: "Opened",
  onboarding: "Onboarding",
};

export function isOnboardingStatus(v: unknown): v is OnboardingStatus {
  return typeof v === "string" && (ONBOARDING_STATUSES as readonly string[]).includes(v);
}

/** The steps a contractor saves, in order. The account step and All set are steps 1 and 6 on the meter. */
export const SETUP_STEPS = ["details", "trades", "w9", "insurance"] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];

/** Six on the meter: Create your account, the four saved steps, All set. */
export const SETUP_TOTAL = 6;

export const SETUP_STEP_NAME: Record<SetupStep, string> = {
  details: "Your details",
  trades: "What you do",
  w9: "W-9",
  insurance: "Insurance",
};

export function isSetupStep(v: unknown): v is SetupStep {
  return typeof v === "string" && (SETUP_STEPS as readonly string[]).includes(v);
}

/** The step's place on the meter: details is 2 of 6, insurance 5 of 6. */
export function setupStepNumber(step: SetupStep): number {
  return SETUP_STEPS.indexOf(step) + 2;
}

/** The step after the furthest one saved, or null once insurance is saved too. */
export function nextSetupStep(saved: string | null | undefined): SetupStep | null {
  if (!isSetupStep(saved)) return "details";
  const i = SETUP_STEPS.indexOf(saved);
  return SETUP_STEPS[i + 1] ?? null;
}

/** Whether `step` is saved, given the furthest step saved. */
export function stepSaved(saved: string | null | undefined, step: SetupStep): boolean {
  return isSetupStep(saved) && SETUP_STEPS.indexOf(saved) >= SETUP_STEPS.indexOf(step);
}

/** The furthest of two saved steps, so going Back and saving an earlier step never moves progress back. */
export function furthestStep(a: string | null | undefined, b: SetupStep): SetupStep {
  if (!isSetupStep(a)) return b;
  return SETUP_STEPS.indexOf(a) >= SETUP_STEPS.indexOf(b) ? a : b;
}

export interface OnboardingFacts {
  signupSource: SignupSourceValue;
  needsReview: boolean;
  setupDoneAt: Date | null;
  /** They have a login (any status). */
  hasLogin: boolean;
  /** Their newest personal invite was opened in a browser. */
  inviteOpened: boolean;
}

/** The badge a contact carries, or null (Active, or never in setup). New wins until a partner keeps them. */
export function onboardingStatus(c: OnboardingFacts): OnboardingStatus | null {
  if (c.signupSource === "STAFF") return null;
  if (c.needsReview) return "new";
  if (!c.hasLogin) return c.inviteOpened ? "opened" : "invited";
  if (!c.setupDoneAt) return "onboarding";
  return null;
}

/**
 * The Contractors list's Status column and filter: the onboarding status while it applies, otherwise what sign-in
 * does with their login (lib/portal/access-state.ts): Active, Invited (made, not used yet) or Access off. Null is no
 * login and never in setup, the empty dash. New wins over all of it (a partner's decision), and Access off wins over
 * Onboarding (they can't sign in to finish). The login's Invited shares the invite's word: asked in, not in yet.
 */
export type AccountStatus = OnboardingStatus | "active" | "off";

export const ACCOUNT_STATUSES: readonly AccountStatus[] = [...ONBOARDING_STATUSES, "active", "off"];

export const ACCOUNT_STATUS_LABEL: Record<AccountStatus, string> = { ...ONBOARDING_LABEL, active: "Active", off: "Access off" };

export function isAccountStatus(v: unknown): v is AccountStatus {
  return typeof v === "string" && (ACCOUNT_STATUSES as readonly string[]).includes(v);
}

/** One status from the onboarding status and the login's state (`portalAccess(...).state`, or null with no login). */
export function accountStatus(onboarding: OnboardingStatus | null, login: PortalAccessState | null): AccountStatus | null {
  if (onboarding === "new") return "new";
  if (login === "off") return "off";
  return onboarding ?? login;
}

/** Whether this contractor sees the setup steps and the card above My jobs. */
export function inSetup(c: { signupSource: SignupSourceValue; setupDoneAt: Date | null }): boolean {
  return c.signupSource !== "STAFF" && !c.setupDoneAt;
}

/** The line under Onboarding: "W-9 · 4 of 6", the step they're on. */
export function setupProgressLine(saved: string | null | undefined): string {
  const next = nextSetupStep(saved);
  if (!next) return `All set · ${SETUP_TOTAL} of ${SETUP_TOTAL}`;
  return `${SETUP_STEP_NAME[next]} · ${setupStepNumber(next)} of ${SETUP_TOTAL}`;
}

export interface SetupFacts {
  fullName: string;
  phone: string | null;
  mailingAddress: string | null;
  tradeCount: number;
  tradesNote: string | null;
  setupStep: string | null;
  w9Count: number;
  insuranceCount: number;
  noInsurance: boolean;
}

/** Each step's done-ness, for the card above My jobs and for Done. */
export function setupChecklist(f: SetupFacts): Record<SetupStep, boolean> {
  return {
    details: !!f.fullName.trim() && !!f.phone?.trim() && !!f.mailingAddress?.trim(),
    // The tenant question is answered on the same step, so a saved trades step is the answer.
    trades: (f.tradeCount > 0 || !!f.tradesNote?.trim()) && stepSaved(f.setupStep, "trades"),
    w9: f.w9Count > 0,
    insurance: f.insuranceCount > 0 || f.noInsurance,
  };
}

/** Done (decision 10): details, trades and a W-9 are in. Insurance is optional. */
export function setupComplete(f: SetupFacts): boolean {
  const c = setupChecklist(f);
  return c.details && c.trades && c.w9;
}

/** A personal invite lasts 14 days (section 10). */
export const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export function inviteExpiresAt(now: Date): Date {
  return new Date(now.getTime() + INVITE_TTL_MS);
}

export type InviteState = "live" | "used" | "expired";

/** Whether an invite row still lets someone in. The shared link has no expiry until it's reset. */
export function inviteState(i: { usedAt: Date | null; expiresAt: Date | null; shared: boolean }, now: Date): InviteState {
  if (!i.shared && i.usedAt) return "used";
  if (i.expiresAt && i.expiresAt.getTime() <= now.getTime()) return "expired";
  return "live";
}

/** The invite text, sent from the partner's own phone (decision 6): "Hi Mike, it's Connor at HG Capital. ..." */
export function inviteTextBody(input: { contractorFirstName: string; senderFirstName: string; link: string }): string {
  const hi = input.contractorFirstName ? `Hi ${input.contractorFirstName}, it's ${input.senderFirstName} at HG Capital.` : `Hi, it's ${input.senderFirstName} at HG Capital.`;
  return `${hi} Set up your contractor account here: ${input.link}`;
}

/** The shared sign-up link's text, for Copy message. */
export function signupTextBody(link: string): string {
  return `Set up your HG Capital contractor account here: ${link}`;
}

/** The path a token opens. */
export function joinPath(token: string): string {
  return `/join/${token}`;
}
