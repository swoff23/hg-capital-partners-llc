"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AddressCombobox } from "@/components/address-combobox";
import { CreateForm } from "@/components/create-form";
import { DealStageMark } from "@/components/deal-stage";
import { NumberInput, numberHelper } from "@/components/number-input";
import type { OptionItem } from "@/components/option-list";
import { Select } from "@/components/select";
import { useToast } from "@/components/toast";
import { FieldRow, FormField, Input, Section, Textarea } from "@/components/ui";
import { addressFromListingLink, looksLikeLink, withScheme } from "@/lib/address-suggestions";
import { DEAL_FIELD_LABEL, DEAL_STATUSES, DEFAULT_DEAL_STATUS, dealStageLabel } from "@/lib/config";
import { shortAddress } from "@/lib/normalize";
import { createDeal, type CreatedDeal } from "./actions";

type Values = {
  address: string;
  status: string;
  theirPriceRaw: string;
  ourPriceRaw: string;
  units: string;
  sourceUrl: string;
  note: string;
};

const STAGES: OptionItem[] = DEAL_STATUSES.map((s) => ({
  id: s,
  label: dealStageLabel(s),
  leading: <DealStageMark stage={s} />,
}));

const blank = (address: string): Values => ({
  address,
  status: DEFAULT_DEAL_STATUS,
  theirPriceRaw: "",
  ourPriceRaw: "",
  units: "",
  sourceUrl: "",
  note: "",
});

/**
 * New deal (forms 4.3): the sheet an intercepting route opens over the
 * deals list, and the same form flat on `/deals/new` for a pasted link or a
 * reload. The address suggests HG's own records as you type, says when it is
 * already a deal (and a property) with a link to it, moves a pasted listing
 * link to Listing link by itself (a Zillow link's street fills the address),
 * and shows what it will save as. Then the Stage (default TBD), the two
 * prices as "Asking price" and "Target offer", Units, Listing link and an
 * optional note that becomes the deal's first timeline note.
 *
 * "Create deal" with Create more; from the sheet you stay on the list, with
 * "767 Prospect Ave added to TBD · Open". `defaultAddress` is search's 'Add
 * "12 Elmwood Ter" as a deal'.
 */
export function NewDealForm({ variant, defaultAddress }: { variant: "sheet" | "page"; defaultAddress?: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const start = defaultAddress ?? "";
  const [values, setValues] = useState<Values>(() => blank(start));
  const set = (patch: Partial<Values>) => setValues((v) => ({ ...v, ...patch }));

  return (
    <CreateForm<Values, CreatedDeal>
      variant={variant}
      title="New deal"
      primary="Create deal"
      discardTitle="Discard the new deal?"
      leaveTitle="Leave the new deal?"
      backHref="/deals"
      createMore
      fullHeight
      values={values}
      // Over a blank form, so a draft kept before a field existed still has every field.
      onRestore={(draft) => setValues({ ...blank(""), ...draft })}
      onReset={() => setValues(blank(""))}
      draftKey={start ? "new-deal:search" : "new-deal"}
      fields={["address", "status", "theirPriceRaw", "ourPriceRaw", "units", "sourceUrl", "note"]}
      check={(data) => {
        const address = String(data.get("address") ?? "").trim();
        if (!address) return { address: "Enter the address." };
        if (looksLikeLink(address)) return { address: "That's a link. Enter the street address." };
        if (address.length < 4) return { address: "Enter the full address, like 123 Main St." };
        return null;
      }}
      action={createDeal}
      onCreated={(deal, more) => {
        toast({
          message: `${shortAddress(deal.address)} added to ${dealStageLabel(deal.status)}`,
          action: { label: "Open", onAction: () => router.push(`/deals/${deal.id}`) },
        });
        if (more) return;
        if (variant === "sheet") router.back();
        else router.replace(`/deals/${deal.id}`);
      }}
    >
      {({ errors, clear }) => (
        <>
          <AddressCombobox
            kind="deal"
            label={DEAL_FIELD_LABEL.address}
            name="address"
            value={values.address}
            onChange={(address) => {
              clear("address");
              set({ address });
            }}
            // A pasted listing link goes to Listing link, and a Zillow link's street becomes the address.
            linkTarget={DEAL_FIELD_LABEL.sourceUrl}
            onLink={(link) => {
              clear("address");
              set({ sourceUrl: withScheme(link), address: addressFromListingLink(link) ?? values.address });
            }}
            showSavesAs
            isRequired
            isInvalid={!!errors.address}
            errorMessage={errors.address}
          />

          <Select
            label={DEAL_FIELD_LABEL.status}
            name="status"
            items={STAGES}
            value={values.status}
            onChange={(status) => set({ status: status ?? DEFAULT_DEAL_STATUS })}
            isInvalid={!!errors.status}
            errorMessage={errors.status}
            searchLabel="Search stages"
          />

          <Section as="h3" title="Details (optional)">
            <div className="space-y-4">
              <FieldRow>
                <FormField label={DEAL_FIELD_LABEL.theirPrice} helper={numberHelper("money", values.theirPriceRaw, { allowText: true })} error={errors.theirPriceRaw}>
                  {(p) => (
                    <NumberInput
                      {...p}
                      kind="money"
                      allowText
                      name="theirPriceRaw"
                      value={values.theirPriceRaw}
                      onChange={(theirPriceRaw) => {
                        clear("theirPriceRaw");
                        set({ theirPriceRaw });
                      }}
                    />
                  )}
                </FormField>
                <FormField label={DEAL_FIELD_LABEL.ourPrice} helper={numberHelper("money", values.ourPriceRaw, { allowText: true })} error={errors.ourPriceRaw}>
                  {(p) => (
                    <NumberInput
                      {...p}
                      kind="money"
                      allowText
                      name="ourPriceRaw"
                      value={values.ourPriceRaw}
                      onChange={(ourPriceRaw) => {
                        clear("ourPriceRaw");
                        set({ ourPriceRaw });
                      }}
                    />
                  )}
                </FormField>
              </FieldRow>

              <FormField label={DEAL_FIELD_LABEL.units} error={errors.units}>
                {(p) => (
                  <NumberInput
                    {...p}
                    kind="integer"
                    name="units"
                    value={values.units}
                    onChange={(units) => {
                      clear("units");
                      set({ units });
                    }}
                  />
                )}
              </FormField>

              <FormField label={DEAL_FIELD_LABEL.sourceUrl} error={errors.sourceUrl}>
                {(p) => (
                  <Input
                    {...p}
                    name="sourceUrl"
                    type="url"
                    inputMode="url"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={values.sourceUrl}
                    onChange={(e) => {
                      clear("sourceUrl");
                      set({ sourceUrl: e.target.value });
                    }}
                  />
                )}
              </FormField>

              <FormField label="Note" helper="Becomes the first note on the deal" error={errors.note}>
                {(p) => (
                  <Textarea
                    {...p}
                    name="note"
                    rows={3}
                    value={values.note}
                    onChange={(e) => {
                      clear("note");
                      set({ note: e.target.value });
                    }}
                    className="field-sizing-content max-h-60 min-h-20"
                  />
                )}
              </FormField>
            </div>
          </Section>
        </>
      )}
    </CreateForm>
  );
}
