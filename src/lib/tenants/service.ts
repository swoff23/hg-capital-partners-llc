import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import * as core from "./core";

/**
 * Tenants and leases (docs/specs/tenants.md): the app's one way to write them.
 * Server actions authenticate and parse, then call in; the rules themselves
 * live in core.ts, which the import script and the Postgres test share. Each
 * write refreshes the pages that show a lease: the Tenants list, the lease
 * page, and its property's Tenants section.
 */

function revalidateLease(leaseId?: string): void {
  revalidatePath("/tenants", "layout");
  if (leaseId) revalidatePath(`/tenants/${leaseId}`);
  revalidatePath("/properties/[id]", "page");
}

export type { NewLease, LeasePatch, TenantPick } from "./core";

/**
 * After a write that held its own transaction and wrote a lease through
 * core.ts (a playbook's Apply, docs/specs/tenants.md section 9): the same
 * pages refresh as for a write through here.
 */
export function leaseChanged(leaseId: string): void {
  revalidateLease(leaseId);
}

export async function createLease(input: core.NewLease, by: core.By): Promise<{ id: string }> {
  const lease = await core.createLease(prisma, input, by);
  revalidateLease(lease.id);
  return lease;
}

export async function patchLease(id: string, patch: core.LeasePatch): Promise<void> {
  await core.patchLease(prisma, id, patch);
  revalidateLease(id);
}

/** A person's details, the same on every lease: each of their leases' pages refreshes. */
export async function patchTenant(tenantId: string, patch: Partial<Record<string, string | null>>): Promise<void> {
  await core.patchTenant(prisma, tenantId, patch);
  revalidateLease();
  const on = await prisma.leaseTenant.findMany({ where: { tenantId }, select: { leaseId: true } });
  for (const l of on) revalidatePath(`/tenants/${l.leaseId}`);
}

export async function addTenant(leaseId: string, pick: core.TenantPick): Promise<{ tenantId: string }> {
  const r = await core.addTenant(prisma, leaseId, pick);
  revalidateLease(leaseId);
  return r;
}

export async function removeTenant(leaseId: string, tenantId: string): Promise<void> {
  await core.removeTenant(prisma, leaseId, tenantId);
  revalidateLease(leaseId);
}

export async function makePrimary(leaseId: string, tenantId: string): Promise<void> {
  await core.makePrimary(prisma, leaseId, tenantId);
  revalidateLease(leaseId);
}

export async function addTerm(leaseId: string, input: Partial<Record<string, string | null>>): Promise<{ id: string }> {
  const r = await core.addTerm(prisma, leaseId, input);
  revalidateLease(leaseId);
  return r;
}

export async function patchTerm(leaseId: string, termId: string, patch: Partial<Record<string, string | null>>): Promise<void> {
  const term = await prisma.leaseTerm.findUnique({ where: { id: termId }, select: { leaseId: true } });
  if (!term || term.leaseId !== leaseId) throw new Error("This term is gone.");
  await core.patchTerm(prisma, termId, patch);
  revalidateLease(leaseId);
}

/** One term gone, its signed lease kept on the lease; returns what Undo puts back. */
export async function deleteTerm(leaseId: string, termId: string): Promise<core.TermSnapshot> {
  const snapshot = await core.deleteTerm(prisma, leaseId, termId);
  revalidateLease(leaseId);
  return snapshot;
}

/** Undo for deleteTerm. */
export async function restoreTerm(leaseId: string, snapshot: core.TermSnapshot): Promise<{ id: string }> {
  const r = await core.restoreTerm(prisma, leaseId, snapshot);
  revalidateLease(leaseId);
  return r;
}

/** Deletes the lease and returns the Blob paths of its files for the caller to remove after the commit. */
export async function deleteLease(id: string): Promise<string[]> {
  const gone = await core.deleteLease(prisma, id);
  revalidateLease(id);
  return gone?.pathnames ?? [];
}
