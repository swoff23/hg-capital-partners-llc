import { requireUser } from "@/lib/auth";
import { getAppConfig } from "@/lib/app-config";
import { CapexRulesEditor } from "./capex-rules-editor";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireUser();
  const { capexRules, version } = await getAppConfig();

  return <CapexRulesEditor initial={capexRules} initialVersion={version} />;
}
