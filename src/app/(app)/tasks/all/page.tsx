import { redirect } from "next/navigation";
import { toQuery } from "@/lib/tasks/list-query";

/**
 * The All tab is the Tasks page now (docs/home-as-today.md). Old links and
 * bookmarks land there with their filters.
 */
export default async function AllTasksRedirect({ searchParams }: PageProps<"/tasks/all">) {
  const search = toQuery(await searchParams).toString();
  redirect(search ? `/tasks?${search}` : "/tasks");
}
