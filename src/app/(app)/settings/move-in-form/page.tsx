import { requireUser } from "@/lib/auth";
import { getMoveInFormSchema } from "@/lib/move-in-form";
import { MoveInFormEditor } from "./move-in-form-editor";

export const dynamic = "force-dynamic";

export default async function MoveInFormSettingsPage() {
  await requireUser();
  const schema = await getMoveInFormSchema();
  return <MoveInFormEditor initial={schema} />;
}
