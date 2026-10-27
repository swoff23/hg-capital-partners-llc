import { NewTaskScreen } from "./new-task-screen";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "New task" };

/**
 * New task as a page: a pasted link, a reload, or a click from somewhere that
 * doesn't intercept. A click inside the app opens the same form as a sheet over
 * the page you were on (`@modal/(.)tasks/new`).
 */
export default function NewTaskPage({ searchParams }: PageProps<"/tasks/new">) {
  return <NewTaskScreen variant="page" searchParams={searchParams} />;
}
