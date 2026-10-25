"use client";
import { useState, useTransition, type FormEvent } from "react";
import { Button, Input, Select, TextLink } from "@/components/ui";
import { callAction } from "@/lib/action-result";
import { PROPERTY_STATUSES } from "@/lib/config";
import { shortAddress } from "@/lib/normalize";
import { createProperty, type ExistingProperty } from "../actions";
import { LabeledField } from "../labeled-field";

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
        <LabeledField label="Address *">
          <Input
            name="address"
            required
            placeholder="123 Main St, Buffalo, NY 14201"
            // A taken address is the field's error: its --danger edge, and the line under it says which property.
            aria-invalid={existing ? true : undefined}
            aria-describedby={existing ? "address-taken" : undefined}
            onChange={() => setExisting(null)}
          />
        </LabeledField>
        {existing && (
          <p id="address-taken" className="mt-1.5 text-meta text-danger">
            Already in Properties: {shortAddress(existing.address)}.{" "}
            <TextLink href={`/properties/${existing.id}`} className="font-medium">
              Open it
            </TextLink>
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <LabeledField label="Status">
          <Select name="status" defaultValue="">
            <option value="">None</option>
            {PROPERTY_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </LabeledField>
        <LabeledField label="Entity">
          <Input name="llcOwner" placeholder="LLC owner" />
        </LabeledField>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create property"}
      </Button>
      {error && (
        <p role="alert" className="text-meta text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
