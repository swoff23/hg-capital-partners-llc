import type { Prisma } from "@prisma/client";
import { TEMPLATE_BUCKET } from "@/lib/config";

/**
 * Spread into any Task `where` that feeds a list or a count. Template-bucket
 * rows are playbook definitions imported from Asana, not open work; before
 * this filter they inflated "Open tasks" on the dashboard and the task list.
 */
export const excludeTemplateTasks = {
  bucket: { not: TEMPLATE_BUCKET },
} satisfies Prisma.TaskWhereInput;
