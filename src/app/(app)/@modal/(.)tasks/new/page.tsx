import { SheetRoute } from "@/components/create-form";
import { NewTaskScreen } from "../../../tasks/new/new-task-screen";

/**
 * New task as a sheet over the page the link was clicked on (forms 3, "keep
 * their URLs"): an intercepted soft navigation to `/tasks/new`. A pasted link
 * or a reload gets `tasks/new/page.tsx` instead, the same form on a page, and
 * the browser's Back closes the sheet.
 */
export default function NewTaskSheet({ searchParams }: PageProps<"/tasks/new">) {
  return (
    <SheetRoute path="/tasks/new">
      <NewTaskScreen variant="sheet" searchParams={searchParams} />
    </SheetRoute>
  );
}
