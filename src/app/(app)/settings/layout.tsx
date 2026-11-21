import { anyLiveConnection, claudeConnectorEnabled } from "@/lib/claude/oauth";
import { claudeSectionVisible } from "./claude/claude-state";
import { SettingsFrame } from "./claude/settings-header";

/**
 * One "Settings" h1 above the tabs, as on Financials. The tabs name what each
 * one holds, so there's no subtitle; a tab's own actions (Reset to defaults,
 * Save) sit at the top of its content. No session check here: each tab's
 * page checks it. With Claude's connector on, a tab's prefetched loading
 * screen costs no query (docs/specs/performance.md 4.1); with it off, the
 * layout asks one small question: is any connection still on record.
 */
export default async function SettingsLayout({ children }: LayoutProps<"/settings">) {
  // Only read while the connector is off, which is how it lands: one small query that reads no user when nobody is
  // connected, and a failed read answers false (src/lib/claude/oauth.ts anyLiveConnection).
  const on = claudeConnectorEnabled();
  const showClaude = claudeSectionVisible(on, on ? true : await anyLiveConnection());
  return (
    <SettingsFrame
      tabs={[
        { href: "", label: "CapEx rules" },
        { href: "/move-in-form", label: "Move-in form" },
        { href: "/storage", label: "Storage" },
        // Claude's tab shows once the connector is on (CLAUDE_CONNECTOR_ENABLED), and while it is off only if a
        // connection is still on record, so switching it off never hides Disconnect.
        ...(showClaude ? [{ href: "/claude", label: "Claude" }] : []),
      ]}
    >
      {children}
    </SettingsFrame>
  );
}
