import { requireUser } from "@/lib/auth";
import { getAppConfig } from "@/lib/app-config";
import { CapexRulesEditor } from "./capex-rules-editor";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Settings" };

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireUser();
  const { capexRules, capexVersion } = await getAppConfig();

  // Keyed by the version it was rendered from, so loading the latest after a conflict starts the editor over on it.
  return <CapexRulesEditor key={capexVersion ?? "new"} initial={capexRules} initialVersion={capexVersion} />;
}
