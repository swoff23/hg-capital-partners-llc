"use client";
import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { Button, Input, Select } from "@/components/ui";
import { callAction } from "@/lib/action-result";
import { PROPERTY_STATUSES } from "@/lib/config";
import { shortAddress } from "@/lib/normalize";
import { createProperty, type ExistingProperty } from "../actions";

/**
 * Posts without a page load, so a refusal keeps every field as typed: an
 * address that's already a property says which one and links to it.
 */
export function NewPropertyForm() {
  const [pending, start] = useTransition();
  const [existing, setExisting] = useState<ExistingProperty | null>(null);
  const [error, setError] = useState("");

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setError("");
    start(async () => {
      const res = await callAction(() => createProperty(data));
      // A new property redirects to its page (callAction lets it through); only a refusal comes back.
      if (!res.ok) setError(res.error);
      else setExisting(res.data.duplicateOf);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="block">
          <span className="text-xs font-medium text-muted">Address *</span>
          <Input
            name="address"
            required
            placeholder="123 Main St, Buffalo, NY 14201"
            onChange={() => setExisting(null)}
            className="mt-1"
          />
        </label>
        {existing && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">
            Already in Properties: {shortAddress(existing.address)}.{" "}
            <Link href={`/properties/${existing.id}`} className="font-medium text-primary hover:underline">
              Open it
            </Link>
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs font-medium text-muted">Status</span>
          <Select name="status" defaultValue="" className="mt-1">
            <option value="">None</option>
            {PROPERTY_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-muted">Entity</span>
          <Input name="llcOwner" placeholder="LLC owner" className="mt-1" />
        </label>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create property"}
      </Button>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </form>
  );
}
