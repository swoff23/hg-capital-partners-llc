"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AddressCombobox } from "@/components/address-combobox";
import { Combobox } from "@/components/combobox";
import { CreateForm } from "@/components/create-form";
import { useToast } from "@/components/toast";
import { looksLikeLink } from "@/lib/address-suggestions";
import { shortAddress } from "@/lib/normalize";
import { createProperty, type CreatedProperty } from "./actions";

type Values = { address: string; llcOwner: string };

const BLANK: Values = { address: "", llcOwner: "" };

/**
 * New property (forms 4.2): the sheet an intercepting route opens over
 * Portfolio, and the same form flat on `/properties/new` for a pasted link or
 * a reload. Two fields: the address, which suggests HG's own records, says
 * when it is already a property and shows what it will save as; and the
 * Entity, picked from the ones already on properties or typed new. Status is
 * not asked: a property without one shows the rail's verb. "Create property"
 * opens the new record with "767 Prospect Ave added".
 */
export function NewPropertyForm({ variant, entities }: { variant: "sheet" | "page"; entities: string[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [values, setValues] = useState<Values>(BLANK);
  const set = (patch: Partial<Values>) => setValues((v) => ({ ...v, ...patch }));

  return (
    <CreateForm<Values, CreatedProperty>
      variant={variant}
      title="New property"
      primary="Create property"
      discardTitle="Discard the new property?"
      leaveTitle="Leave without saving the new property?"
      backHref="/properties"
      values={values}
      onRestore={(draft) => setValues({ ...BLANK, ...draft })}
      onReset={() => setValues(BLANK)}
      draftKey="new-property"
      fields={["address", "llcOwner"]}
      check={(data) => {
        const address = String(data.get("address") ?? "").trim();
        if (!address) return { address: "Enter the address." };
        if (looksLikeLink(address)) return { address: "That's a link. Enter the street address." };
        if (address.length < 4) return { address: "Enter the full street address, like 123 Main St." };
        return null;
      }}
      action={createProperty}
      onCreated={(property) => {
        // The record is the next step: it opens, and its empty facts are the verbs.
        toast({ message: `${shortAddress(property.address)} added` });
        router.replace(`/properties/${property.id}`);
      }}
    >
      {({ errors, clear }) => (
        <>
          <AddressCombobox
            kind="property"
            label="Address"
            name="address"
            value={values.address}
            onChange={(address) => {
              clear("address");
              set({ address });
            }}
            showSavesAs
            isRequired
            isInvalid={!!errors.address}
            errorMessage={errors.address}
          />
          <Combobox
            label="Entity (optional)"
            name="llcOwner"
            items={entities}
            allowCustom
            value={values.llcOwner}
            onChange={(llcOwner) => {
              clear("llcOwner");
              set({ llcOwner });
            }}
            isInvalid={!!errors.llcOwner}
            errorMessage={errors.llcOwner}
          />
        </>
      )}
    </CreateForm>
  );
}
