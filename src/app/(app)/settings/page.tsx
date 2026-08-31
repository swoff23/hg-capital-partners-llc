import { requireUser } from "@/lib/auth";
import { getCapexRules } from "@/lib/capex-rules";
import { CapexRulesEditor } from "./capex-rules-editor";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireUser();
  const rules = await getCapexRules();

  return <CapexRulesEditor initial={rules} />;
}
