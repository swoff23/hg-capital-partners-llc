import { requireUser } from "@/lib/auth";
import { getAppConfig } from "@/lib/app-config";
import { MoveInFormEditor } from "./move-in-form-editor";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Move-in form" };

export const dynamic = "force-dynamic";

export default async function MoveInFormSettingsPage() {
  await requireUser();
  const { moveInFormSchema, moveInVersion } = await getAppConfig();
  return <MoveInFormEditor key={moveInVersion ?? "new"} initial={moveInFormSchema} initialVersion={moveInVersion} />;
}
