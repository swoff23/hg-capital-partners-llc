import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { ConflictError, FieldError } from "@/lib/action-result";
import { fieldText, staleFields } from "@/lib/properties/edits";
import { joinDocLines, splitDocLines } from "@/lib/contacts";
import { CONTACT_FIELDS, readContactPatch, readNewContact } from "./contact-fields";

/**
 * Contractor domain: staff edits to a Contact row go through here. Server
 * actions authenticate and parse, then call in. The spreadsheet and Asana
 * imports still write their own rows (scripts/migrate/02-contractors.ts,
 * src/lib/asana/import.ts), and the portal login has its own service
 * (src/lib/portal/accounts.ts).
 *
 * Rules that live here:
 *   - what can change and how each field reads: contact-fields.ts
 *   - a save is refused when a field it changes moved after the editor
 *     loaded it, as the property editors are (src/lib/properties/edits.ts)
 */

/**
 * A contractor's name, trade and phone show on more than their own page:
 * the directory, task rows and pages (Home, Tasks, a property's and a
 * deal's tasks), the assignee pickers (New task, Apply playbook), and their
 * own portal.
 */
function revalidateContact(id: string): void {
  revalidatePath(`/contractors/${id}`);
  revalidatePath("/contractors");
  revalidatePath("/");
  revalidatePath("/tasks", "layout");
  revalidatePath("/templates", "layout");
  revalidatePath("/properties/[id]", "page");
  revalidatePath("/deals/[id]", "page");
  revalidatePath("/p", "layout");
}

/**
 * A contact row that moved on since the editor loaded it, as a refusal that
 * says when and what the fields hold now. A contact doesn't record who saved
 * last, so the line reads "This changed at 2:14 PM." The notes are shown
 * without the import's document lines, as the editor shows them.
 */
function contactConflict(current: { updatedAt: Date; comments: string | null } & Record<string, unknown>, fields: string[]): ConflictError {
  const { notes } = splitDocLines(current.comments);
  const shown: Record<string, unknown> = { ...current, comments: notes };
  return new ConflictError({
    fields,
    at: current.updatedAt,
    theirs: Object.fromEntries(fields.map((k) => [k, fieldText(shown[k])])),
  });
}

/**
 * Save the Contact section's edits. `patch` holds only the fields the editor
 * changed ("" clears one; names outside CONTACT_FIELDS are ignored), and
 * `expected` the value it loaded for each. Nothing is written when a field
 * doesn't read (a bad email, an empty name) or when someone else changed one
 * of these fields meanwhile.
 */
export async function patchContact(id: string, patch: Record<string, string>, expected: Record<string, string> = {}): Promise<void> {
  const read = readContactPatch(patch);
  if (!read.ok) throw new FieldError({ [read.field]: read.message });
  if (Object.keys(read.data).length === 0) return;

  const fields = CONTACT_FIELDS.filter((k) => Object.prototype.hasOwnProperty.call(patch, k));
  const current = await prisma.contact.findUnique({ where: { id } });
  const guarded = fields.filter((k) => Object.prototype.hasOwnProperty.call(expected, k));
  const edits = {
    changes: Object.fromEntries(guarded.map((k) => [k, patch[k] ?? ""])),
    expected: Object.fromEntries(guarded.map((k) => [k, expected[k]])),
  };
  if (!current) throw new Error("This contractor is gone.");
  // The editor never sees the import's "W-9 on file:" lines, so compare and
  // save notes without them, then put them back.
  const { notes, docLines } = splitDocLines(current.comments);
  const stale = staleFields({ ...current, comments: notes }, edits);
  if (stale.length > 0) throw contactConflict(current, stale);
  const data = "comments" in read.data ? { ...read.data, comments: joinDocLines(read.data.comments, docLines) } : read.data;
  // At the version just read, so a save that lands in between is refused too.
  const r = await prisma.contact.updateMany({ where: { id, updatedAt: current.updatedAt }, data });
  if (r.count === 0) {
    const now = await prisma.contact.findUnique({ where: { id } });
    throw now ? contactConflict(now, guarded) : new Error("This contractor is gone.");
  }
  revalidateContact(id);
}

/**
 * Add a contractor from the New contractor sheet (forms 4.6): the name, and
 * whatever else was filled in, read by the same rules as an edit. Every
 * problem comes back on its field. A phone is saved with its dialable
 * `phoneE164`, trades with the repeats folded out.
 */
export async function createContact(input: Record<string, string>): Promise<{ id: string; fullName: string }> {
  const read = readNewContact(input);
  if (!read.ok) throw new FieldError(read.problems as Record<string, string>);
  const created = await prisma.contact.create({ data: read.data, select: { id: true, fullName: true } });
  revalidateContact(created.id);
  return created;
}
