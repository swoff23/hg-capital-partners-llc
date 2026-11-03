import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";

/**
 * Any address under /settings that no page answers: the app's own Not found,
 * inside the shell ((app)/not-found.tsx), instead of the public site's 404,
 * which would read as if a signed-in person had been signed out. It checks
 * the session itself, as every page under a section layout does: the layout
 * no longer reads it (lib/loading-screens.test.ts).
 */
export default async function Missing(): Promise<never> {
  await requireUser();
  notFound();
}
