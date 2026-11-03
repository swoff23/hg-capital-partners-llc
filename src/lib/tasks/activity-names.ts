import "server-only";
import { prisma } from "@/lib/db";
import { shortAddress } from "@/lib/normalize";
import type { ActivityNames } from "./activity";

/**
 * Names for the contractors and properties a task's lines name by id
 * (activity.ts activityRecordIds), read by id and archived or not: an
 * archived record is out of every picker, but the history that names it
 * still says who and where. A property reads as the pickers label it.
 */
export async function activityRecordNames(ids: { contacts: readonly string[]; properties: readonly string[] }): Promise<Required<Pick<ActivityNames, "contacts" | "properties">>> {
  const [contacts, properties] = await Promise.all([
    ids.contacts.length ? prisma.contact.findMany({ where: { id: { in: [...ids.contacts] } }, select: { id: true, fullName: true } }) : [],
    ids.properties.length ? prisma.property.findMany({ where: { id: { in: [...ids.properties] } }, select: { id: true, address: true } }) : [],
  ]);
  return {
    contacts: Object.fromEntries(contacts.map((c) => [c.id, c.fullName])),
    properties: Object.fromEntries(properties.map((p) => [p.id, shortAddress(p.address)])),
  };
}
