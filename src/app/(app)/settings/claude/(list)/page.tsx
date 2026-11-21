import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { claudeConnectorEnabled, listConnections } from "@/lib/claude/oauth";
import { ClaudeRows } from "../claude-rows";
import { claudeRows, claudeSectionVisible } from "../claude-state";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Claude" };

export const dynamic = "force-dynamic";

/**
 * Settings › Claude (docs/specs/tasks-from-claude.md 7.1): who has connected their Claude, and Connect or
 * Disconnect. With CLAUDE_CONNECTOR_ENABLED off it is a 404 unless a connection is still on record; then it lists
 * the rows with Disconnect and no Connect, so switching the connector off never hides the only way to end one.
 */
export default async function ClaudeSettingsPage() {
  const user = await requireUser();
  const enabled = claudeConnectorEnabled();
  const partners = await listConnections();
  if (!claudeSectionVisible(enabled, partners.some((p) => p.connection !== null))) notFound();
  return <ClaudeRows rows={claudeRows(partners, user.id, new Date(), enabled)} />;
}
