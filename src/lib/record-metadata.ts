import "server-only";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordTitle, type RecordKind } from "@/lib/record-title";

/**
 * generateMetadata for a record page: its tab title (record-title.ts), read
 * with one small select. Only for a signed-in staff member, so a signed-out
 * request (which the layout sends to /login) never gets a record's name in
 * its <title>. A record that's gone gets no title of its own; the page's
 * notFound() answers it.
 */
export async function recordMetadata(kind: RecordKind, id: string): Promise<Metadata> {
  if (!(await getCurrentUser())) return {};
  const title = recordTitle(kind, await nameOf(kind, id));
  return title ? { title } : {};
}

async function nameOf(kind: RecordKind, id: string): Promise<string | null> {
  switch (kind) {
    case "property":
      return (await prisma.property.findUnique({ where: { id }, select: { address: true } }))?.address ?? null;
    case "deal":
      return (await prisma.deal.findUnique({ where: { id }, select: { address: true } }))?.address ?? null;
    case "task":
      return (await prisma.task.findUnique({ where: { id }, select: { title: true } }))?.title ?? null;
    case "contractor":
      return (await prisma.contact.findUnique({ where: { id }, select: { fullName: true } }))?.fullName ?? null;
    case "template":
      return (await prisma.taskTemplate.findUnique({ where: { id }, select: { name: true } }))?.name ?? null;
  }
}
