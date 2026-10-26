/**
 * The assignee picker's types, and the picker itself under its old path. The
 * picker is `AssigneePicker` in `components/entity-picker.tsx`, built on the
 * option list with the property and unit pickers; importing it from here
 * keeps the callers that predate that file working.
 */
export { AssigneePicker } from "@/components/entity-picker";

/** Who a task is assigned to: a staff user, a contractor (Contact), or nobody. Never both. */
export type AssigneeValue = { userId: string } | { contactId: string } | null;

export type AssigneeUser = { id: string; name: string | null; email: string };
export type AssigneeContractor = {
  id: string;
  name: string;
  /** Contact.trades: "Plumbing", "Electric". Shown under the name and searched. */
  trade?: string | null;
  /** The contact's email, which search matches too. */
  email?: string | null;
  /** An active portal account, so they'll see the job when it's theirs. */
  hasLogin?: boolean;
};
