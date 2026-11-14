"use client";
import { useState } from "react";
import { FormSheet } from "@/components/form-sheet";
import { Button, FormField, Input, Textarea } from "@/components/ui";
import { useRun } from "@/components/use-run";
import { firstName } from "@/lib/names";
import { TENANT_FIELDS, readTenant, type TenantField } from "@/lib/tenants/fields";
import { addLeaseTenant, makeLeasePrimary, removeLeaseTenant, saveTenant } from "./actions";

/** A person on the lease, as the sheet edits them. */
export type TenantRow = {
  id: string;
  fullName: string;
  phone: string | null;
  phoneE164: string | null;
  email: string | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
  notes: string | null;
  primary: boolean;
};

type Form = Record<TenantField, string>;

const blank = (t: TenantRow | null): Form => ({
  fullName: t?.fullName ?? "",
  phone: t?.phone ?? "",
  email: t?.email ?? "",
  emergencyName: t?.emergencyName ?? "",
  emergencyPhone: t?.emergencyPhone ?? "",
  notes: t?.notes ?? "",
});

/**
 * One tenant's sheet (docs/specs/tenants.md section 6): name, phone, email,
 * emergency contact and notes, with Make primary and Remove from lease for a
 * person already on it. `tenant` null adds someone new. A person's details are
 * the same on every lease they're on, so a save here changes them everywhere.
 */
export function TenantSheet({
  leaseId,
  tenant,
  isOpen,
  onOpenChange,
}: {
  leaseId: string;
  tenant: TenantRow | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [form, setForm] = useState<Form>(() => blank(tenant));
  const [problems, setProblems] = useState<Record<string, string>>({});
  const run = useRun();
  const first = tenant ? firstName(tenant.fullName) || tenant.fullName : "";

  const set = (field: TenantField, value: string) => {
    if (run.error) run.reset();
    setForm((f) => ({ ...f, [field]: value }));
    setProblems((p) => {
      if (!(field in p)) return p;
      const rest = { ...p };
      delete rest[field];
      return rest;
    });
  };

  function submit() {
    const read = readTenant(form, tenant ? "patch" : "new");
    if (!read.ok) {
      setProblems(read.problems);
      return;
    }
    if (tenant) {
      const changed = Object.fromEntries(TENANT_FIELDS.filter((f) => form[f] !== blank(tenant)[f]).map((f) => [f, form[f]]));
      if (Object.keys(changed).length === 0) {
        onOpenChange(false);
        return;
      }
      run.run(() => saveTenant(tenant.id, changed), {
        failure: "inline",
        succeeded: () => onOpenChange(false),
        done: `${first}'s details saved`,
        key: `tenant:${tenant.id}`,
      });
      return;
    }
    run.run(() => addLeaseTenant(leaseId, { fields: form }), {
      failure: "inline",
      succeeded: () => onOpenChange(false),
      done: `${firstName(form.fullName) || form.fullName.trim()} added to the lease`,
      key: `lease:${leaseId}:tenant`,
    });
  }

  function makePrimary() {
    if (!tenant) return;
    run.run(() => makeLeasePrimary(leaseId, tenant.id), {
      failure: "inline",
      succeeded: () => onOpenChange(false),
      done: `${first} is the primary tenant`,
      key: `lease:${leaseId}:primary`,
    });
  }

  function remove() {
    if (!tenant) return;
    const was = tenant;
    run.run(() => removeLeaseTenant(leaseId, was.id), {
      failure: "inline",
      succeeded: () => onOpenChange(false),
      done: `${first} removed from the lease`,
      key: `lease:${leaseId}:tenant`,
      // Back on the lease, and primary again when they were.
      undo: async () => {
        const back = await addLeaseTenant(leaseId, { tenantId: was.id });
        return back.ok && was.primary ? makeLeasePrimary(leaseId, was.id) : back;
      },
    });
  }

  // The add path reports its problems as `tenants.0.phone`.
  const errors: Record<string, string> = { ...problems };
  for (const [k, v] of Object.entries(run.fieldErrors ?? {})) errors[k.replace(/^tenants\.0\./, "")] = v;

  return (
    <FormSheet
      title={tenant ? tenant.fullName : "Add tenant"}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onSubmit={submit}
      primary={tenant ? "Save tenant" : "Add tenant"}
      pending={run.pending}
      values={form}
      discardTitle={tenant ? `Discard changes to ${first}?` : "Discard the new tenant?"}
      leaveTitle={tenant ? `Leave ${first}'s details?` : "Leave without adding?"}
      error={run.error}
      fieldErrors={errors}
    >
      <FormField label="Name" error={errors.fullName}>
        {(p) => <Input {...p} name="fullName" autoComplete="off" value={form.fullName} onChange={(e) => set("fullName", e.target.value)} />}
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Phone" optional error={errors.phone}>
          {(p) => <Input {...p} name="phone" type="tel" autoComplete="off" value={form.phone} onChange={(e) => set("phone", e.target.value)} />}
        </FormField>
        <FormField label="Email" optional error={errors.email}>
          {(p) => <Input {...p} name="email" type="email" autoComplete="off" value={form.email} onChange={(e) => set("email", e.target.value)} />}
        </FormField>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Emergency contact" optional error={errors.emergencyName}>
          {(p) => <Input {...p} name="emergencyName" autoComplete="off" value={form.emergencyName} onChange={(e) => set("emergencyName", e.target.value)} />}
        </FormField>
        <FormField label="Emergency phone" optional error={errors.emergencyPhone}>
          {(p) => <Input {...p} name="emergencyPhone" type="tel" autoComplete="off" value={form.emergencyPhone} onChange={(e) => set("emergencyPhone", e.target.value)} />}
        </FormField>
      </div>
      <FormField label="Notes" optional error={errors.notes}>
        {(p) => <Textarea {...p} name="notes" rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} />}
      </FormField>
      {tenant && (
        <div className="flex flex-wrap gap-2">
          {!tenant.primary && (
            <Button type="button" variant="secondary" size="sm" disabled={run.pending} onClick={makePrimary}>
              Make primary
            </Button>
          )}
          <Button type="button" variant="danger" size="sm" disabled={run.pending} onClick={remove}>
            Remove from lease
          </Button>
        </div>
      )}
    </FormSheet>
  );
}
