"use client";
import { useState, useTransition } from "react";
import { Button, Input, Select } from "@/components/ui";
import { DEAL_STATUSES, DEAL_PASS_REASONS } from "@/lib/config";
import { updateDeal } from "../actions";

export type EditableDeal = {
  id: string;
  version: string;
  status: string;
  theirPriceRaw: string | null;
  ourPriceRaw: string | null;
  nextAction: string | null;
  nextActionDue: string | null; // yyyy-mm-dd
  passReason: string | null;
  sourceUrl: string | null;
};

export function EditDeal({ deal }: { deal: EditableDeal }) {
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  function save(formData: FormData) {
    start(async () => {
      await updateDeal(deal.id, formData);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  }

  return (
    <form action={save} className="grid gap-3 sm:grid-cols-2" key={deal.version}>
      <label className="block">
        <span className="text-xs font-medium text-muted">Status</span>
        <Select name="status" defaultValue={deal.status} className="mt-1">
          {[...new Set([deal.status, ...DEAL_STATUSES])].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
      </label>
      <label className="block">
        <span className="text-xs font-medium text-muted">Pass reason</span>
        <Select name="passReason" defaultValue={deal.passReason ?? ""} className="mt-1">
          <option value="">—</option>
          {DEAL_PASS_REASONS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </Select>
      </label>
      <label className="block">
        <span className="text-xs font-medium text-muted">Their price</span>
        <Input name="theirPriceRaw" defaultValue={deal.theirPriceRaw ?? ""} className="mt-1" />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-muted">Our price (target/max)</span>
        <Input name="ourPriceRaw" defaultValue={deal.ourPriceRaw ?? ""} className="mt-1" />
      </label>
      <label className="block sm:col-span-2">
        <span className="text-xs font-medium text-muted">Next action</span>
        <Input name="nextAction" defaultValue={deal.nextAction ?? ""} className="mt-1" />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-muted">Next action due</span>
        <Input name="nextActionDue" type="date" defaultValue={deal.nextActionDue ?? ""} className="mt-1" />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-muted">Listing URL</span>
        <Input name="sourceUrl" type="url" defaultValue={deal.sourceUrl ?? ""} className="mt-1" />
      </label>
      <div className="flex items-center gap-2 sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        {saved && <span className="text-xs text-green-600">Saved</span>}
      </div>
    </form>
  );
}
