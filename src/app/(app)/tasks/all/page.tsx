import { redirect } from "next/navigation";

/**
 * The All tab is the Tasks page now (docs/home-as-today.md). Old links and
 * bookmarks land there with their filters.
 */
export default async function AllTasksRedirect({ searchParams }: PageProps<"/tasks/all">) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) qs.append(key, v);
  }
  const search = qs.toString();
  redirect(search ? `/tasks?${search}` : "/tasks");
}
