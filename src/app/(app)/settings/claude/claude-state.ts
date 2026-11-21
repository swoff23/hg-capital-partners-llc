import { BRAND } from "@/lib/brand";
import { daysUntil, fmtDay, todayYmdEastern } from "@/lib/dates";
import { firstName } from "@/lib/names";

/** What Settings › Claude needs of one listed partner (the shape of lib/claude's ConnectionRow). */
export type ListedPartner = {
  userId: string;
  name: string | null;
  email: string;
  connection: { connectedAt: Date; lastUsedAt: Date | null } | null;
};

export type ClaudeRowView = {
  userId: string;
  name: string;
  /** For the Disconnect button's name, so two of them don't read alike. */
  first: string;
  /** The state line is `lead` + `tail`. A phone shows only `tail`: "Used today", never a cut-off "Connected Nov 20 · Used tod…". */
  lead: string;
  tail: string;
  connected: boolean;
  /** The viewer's own row while the connector is on: the only row that offers Connect. */
  canConnect: boolean;
};

/** "Used today", "Used yesterday" or "Used Nov 18", by Buffalo's calendar. */
export function usedLabel(lastUsedAt: Date, now: Date): string {
  const today = todayYmdEastern(now);
  const day = todayYmdEastern(lastUsedAt);
  const ago = daysUntil(day, today);
  if (ago === 0) return "Used today";
  if (ago === -1) return "Used yesterday";
  return `Used ${fmtDay(day, { year: "auto", now: today })}`;
}

/**
 * The two halves of "Connected Nov 20 · Used today". Before the first use there is only the first half, and it is
 * the `tail`, so a phone still shows it.
 */
export function connectionParts(connection: { connectedAt: Date; lastUsedAt: Date | null }, now: Date): { lead: string; tail: string } {
  const today = todayYmdEastern(now);
  const connected = `Connected ${fmtDay(todayYmdEastern(connection.connectedAt), { year: "auto", now: today })}`;
  if (!connection.lastUsedAt) return { lead: "", tail: connected };
  return { lead: `${connected} · `, tail: usedLabel(connection.lastUsedAt, now) };
}

/** "Connected Nov 20 · Used today". Before the first use there is no "Used" part. */
export function connectionLine(connection: { connectedAt: Date; lastUsedAt: Date | null }, now: Date): string {
  const { lead, tail } = connectionParts(connection, now);
  return lead + tail;
}

/** `connectorOn` false (switched off): rows still list and disconnect, and no row offers Connect. */
export function claudeRows(partners: readonly ListedPartner[], viewerId: string, now: Date, connectorOn: boolean): ClaudeRowView[] {
  return partners.map((p) => {
    const name = p.name?.trim() || p.email;
    const parts = p.connection ? connectionParts(p.connection, now) : { lead: "", tail: "Not connected" };
    return {
      userId: p.userId,
      name,
      first: firstName(p.name) || name,
      ...parts,
      connected: p.connection !== null,
      canConnect: connectorOn && p.connection === null && p.userId === viewerId,
    };
  });
}

/**
 * Whether Settings shows the Claude tab and its page: while the connector is on, and while it is off but a
 * connection is still on record, so switching it off never hides the only Disconnect screen.
 */
export function claudeSectionVisible(connectorOn: boolean, anyLiveConnection: boolean): boolean {
  return connectorOn || anyLiveConnection;
}

/** The toast after Disconnect, with the partner's first name from the record, and its phone twin. */
export function disconnectedMessage(name: string | null | undefined): { message: string; phoneMessage: string } {
  const first = firstName(name);
  return first
    ? { message: `Claude disconnected for ${first}.`, phoneMessage: `Disconnected for ${first}.` }
    : { message: "Claude disconnected.", phoneMessage: "Disconnected." };
}

/** Lines that arrive as a toast. Each is held to TOAST_PHONE_CHARS in the tests. */
export const CLAUDE_LINES = {
  addressCopied: "Address copied",
  copyFailed: "Couldn't copy. Select it.",
  noAddress: "Disconnect, then try again.",
  partnerGone: "Partner not found. Reload.",
} as const;

/** The four steps in the Connect sheet, in Claude's own order (it asks for a name first). Step 1 carries the copy field. */
export const CONNECT_STEPS = [
  "Copy your address.",
  "In Claude, open Customize, Connectors, Add custom connector.",
  `Name it ${BRAND.app}, paste the address, then Continue and Add.`,
  "Tap Connect, then Allow.",
] as const;

/** The approval page when there is nothing to approve, for every reason. */
export const APPROVAL_EXPIRED = "This link has expired. Try again from Claude.";
