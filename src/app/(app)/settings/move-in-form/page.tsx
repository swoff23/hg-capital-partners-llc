import { requireUser } from "@/lib/auth";
import { getAppConfig } from "@/lib/app-config";
import { MoveInFormEditor } from "./move-in-form-editor";

export const dynamic = "force-dynamic";

export default async function MoveInFormSettingsPage() {
  await requireUser();
  const { moveInFormSchema, version } = await getAppConfig();
  return <MoveInFormEditor initial={moveInFormSchema} initialVersion={version} />;
}
