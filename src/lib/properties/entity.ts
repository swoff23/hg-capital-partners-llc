import { ENTITY_NAMES } from "@/lib/quickbooks/entities";

/** Said under Entity when a name isn't one of the companies. */
export const ENTITY_MESSAGE = "Pick a company from the list.";

/**
 * Whether `next` can be saved as a property's entity: one of the companies
 * (ENTITY_NAMES), empty, or the value already stored, so a property set
 * before the list existed is never refused for keeping what it has. Returns
 * the message to show, or null when it can be saved.
 */
export function entityProblem(next: string | null | undefined, stored: string | null | undefined): string | null {
  const name = next?.trim() || null;
  if (name == null) return null;
  if (ENTITY_NAMES.includes(name)) return null;
  if (stored != null && name === stored.trim()) return null;
  return ENTITY_MESSAGE;
}
