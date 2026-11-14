"use client";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { CreateForm } from "@/components/create-form";
import { DateField } from "@/components/date-field";
import { PropertyPicker, UnitPicker } from "@/components/entity-picker";
import { NumberInput } from "@/components/number-input";
import { useToast } from "@/components/toast";
import { AddRow, Button, Checkbox, FieldRow, FormField, Input, Section } from "@/components/ui";
import type { FieldErrors } from "@/lib/action-result";
import { fmtDay, type Ymd } from "@/lib/dates";
import { firstName } from "@/lib/names";
import { unitDisplay, type PropertyOption } from "@/lib/picker-options-shape";
import { MAX_TENANTS, readDeposit, readStay, readTenant, readTerm } from "@/lib/tenants/fields";
import { createNewLease } from "./actions";

/** A rentable unit as the form needs it: the id a lease points at, and the label the picker shows. */
export type LeaseUnit = { id: string; label: string };

type TenantRow = { fullName: string; phone: string; email: string };

type Values = {
  propertyId: string | null;
  unitLabel: string | null;
  tenants: TenantRow[];
  movesIn: Ymd | null;
  startsOn: Ymd | null;
  endsOn: Ymd | null;
  monthToMonth: boolean;
  rent: string;
  subsidy: string;
  subsidyFrom: string;
  deposit: string;
};

const BLANK_TENANT: TenantRow = { fullName: "", phone: "", email: "" };

function blank(initial: { propertyId: string | null; unitLabel: string | null }): Values {
  return {
    ...initial,
    tenants: [{ ...BLANK_TENANT }],
    movesIn: null,
    startsOn: null,
    endsOn: null,
    monthToMonth: false,
    rent: "",
    subsidy: "",
    subsidyFrom: "",
    deposit: "",
  };
}

/** Every field that shows its own line; the tenants' are keyed `tenants.<row>.<field>`. */
const FIELDS: readonly string[] = [
  "propertyId",
  "unitId",
  "tenants",
  "movesIn",
  "startsOn",
  "endsOn",
  "rent",
  "subsidy",
  "subsidyFrom",
  "deposit",
  ...Array.from({ length: MAX_TENANTS }, (_, i) => ["fullName", "phone", "email"].map((f) => `tenants.${i}.${f}`)).flat(),
];

const dayText = (d: Ymd | null) => d ?? "";

/** The lines the form checks before sending: the same rules the service keeps (src/lib/tenants/fields.ts), so a typo never costs a round trip. */
function problemsOf(v: Values, units: readonly LeaseUnit[]): FieldErrors | null {
  const found: FieldErrors = {};
  if (!v.propertyId) found.propertyId = "Choose a property.";
  if (v.propertyId && units.length > 0 && !v.unitLabel) found.unitId = "Pick a unit.";
  v.tenants.forEach((t, i) => {
    const read = readTenant(t, "new");
    if (!read.ok) for (const [field, line] of Object.entries(read.problems)) found[`tenants.${i}.${field}`] = line;
  });
  const stay = readStay({ movesIn: dayText(v.movesIn) });
  if (!stay.ok) Object.assign(found, stay.problems);
  const term = readTerm({
    startsOn: dayText(v.startsOn),
    endsOn: v.monthToMonth ? "" : dayText(v.endsOn),
    rent: v.rent,
    subsidy: v.subsidy,
    subsidyFrom: v.subsidyFrom,
  });
  if (!term.ok) Object.assign(found, term.problems);
  const deposit = readDeposit(v.deposit);
  if (!deposit.ok) Object.assign(found, deposit.problems);
  return Object.keys(found).length > 0 ? found : null;
}

/** A picker's label over it and its refusal under it; the pickers and the date field have no field wiring of their own. */
function PickField({ label, error, optional = false, children }: { label: string; error?: string; optional?: boolean; children: ReactNode }) {
  return (
    <div data-invalid={error ? "true" : undefined} className="flex min-w-0 flex-col gap-1.5">
      <span className="text-meta font-medium text-fg-2">
        {label}
        {optional && <span className="font-normal text-muted-foreground"> (optional)</span>}
      </span>
      {children}
      {error && <p className="truncate text-meta text-destructive">{error}</p>}
    </div>
  );
}

/**
 * New lease (docs/specs/tenants.md section 7), on `CreateForm` like New
 * contractor: a flat page with the draft, the discard question and the field
 * lines. Where (Property, then Unit when the building has rentable units),
 * Tenants (a row per person, the first primary), Dates (Moves in, then the
 * first term's Starts and Ends, with Month to month) and Money (Rent, the
 * housing authority's share and who pays it, Deposit). Pairs of fields sit
 * side by side from sm; phones stack. A save goes to the new lease's page with
 * a toast that names what's next.
 */
export function NewLeaseForm({
  properties,
  unitsByProperty,
  initial,
  meId,
  today,
}: {
  properties: PropertyOption[];
  unitsByProperty: Record<string, LeaseUnit[]>;
  initial: { propertyId: string | null; unitLabel: string | null };
  meId: string;
  today: Ymd;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [values, setValues] = useState<Values>(() => blank(initial));
  const set = (patch: Partial<Values>) => setValues((v) => ({ ...v, ...patch }));

  const property = values.propertyId ? properties.find((p) => p.id === values.propertyId) : undefined;
  const units = (values.propertyId && unitsByProperty[values.propertyId]) || [];
  const unit = values.unitLabel ? units.find((u) => u.label === values.unitLabel) : undefined;

  function pickProperty(id: string | null) {
    const next = (id && unitsByProperty[id]) || [];
    // A building with one rentable unit has nothing to choose: its unit is picked for them.
    set({
      propertyId: id,
      unitLabel: next.length === 1 ? next[0].label : null,
    });
  }

  function patchTenant(i: number, patch: Partial<TenantRow>) {
    setValues((v) => ({
      ...v,
      tenants: v.tenants.map((t, k) => (k === i ? { ...t, ...patch } : t)),
    }));
  }

  return (
    <CreateForm<Values, { id: string }>
      variant="page"
      title="New lease"
      primary="Save lease"
      discardTitle="Discard the new lease?"
      leaveTitle="Leave the new lease?"
      backHref="/tenants"
      values={values}
      // Over a blank form, so a draft kept before a field existed still has every field.
      onRestore={(draft) => setValues({ ...blank(initial), ...draft })}
      onReset={() => setValues(blank(initial))}
      draftKey={`new-lease:${meId}:${initial.propertyId ?? "none"}`}
      fields={FIELDS}
      check={() => problemsOf(values, units)}
      // The fields are controlled, so the action gets the values, not the posted form.
      action={() =>
        createNewLease({
          propertyId: values.propertyId ?? "",
          unitId: unit?.id ?? null,
          tenants: values.tenants,
          movesIn: dayText(values.movesIn),
          deposit: values.deposit,
          startsOn: dayText(values.startsOn),
          endsOn: values.monthToMonth ? "" : dayText(values.endsOn),
          rent: values.rent,
          subsidy: values.subsidy,
          subsidyFrom: values.subsidy.trim() ? values.subsidyFrom : "",
        })
      }
      onCreated={(created) => {
        const who = firstName(values.tenants[0]?.fullName) || "They";
        const where = values.unitLabel ? unitDisplay(values.unitLabel) : (property?.label ?? "the property");
        const from = values.movesIn && values.movesIn > today ? fmtDay(values.movesIn, { year: "auto" }) : "today";
        toast({
          message: `Lease saved. ${who} shows on jobs at ${where} from ${from}.`,
        });
        router.replace(`/tenants/${created.id}`);
      }}
    >
      {({ errors, clear }) => {
        function change(patch: Partial<Values>, ...names: string[]) {
          for (const n of names) clear(n);
          set(patch);
        }
        const tenantLine = (i: number, field: keyof TenantRow) => errors[`tenants.${i}.${field}`];
        const hasSubsidy = values.subsidy.trim() !== "";
        return (
          <>
            <FieldRow>
              <PickField label="Property" error={errors.propertyId}>
                <PropertyPicker
                  value={values.propertyId}
                  properties={properties}
                  required
                  trigger="field"
                  className={errors.propertyId ? "border-destructive" : undefined}
                  onChange={(id) => {
                    clear("propertyId");
                    clear("unitId");
                    pickProperty(id);
                  }}
                />
              </PickField>
              {units.length > 0 && (
                <PickField label="Unit" error={errors.unitId}>
                  <UnitPicker
                    value={values.unitLabel}
                    units={units.map((u) => u.label)}
                    required
                    trigger="field"
                    className={errors.unitId ? "border-destructive" : undefined}
                    onChange={(unitLabel) => change({ unitLabel }, "unitId")}
                  />
                </PickField>
              )}
            </FieldRow>

            <Section as="h3" title="Tenants">
              <div className="space-y-4">
                {errors.tenants && <p className="text-meta text-destructive">{errors.tenants}</p>}
                {values.tenants.map((t, i) => (
                  <div key={i} className="space-y-3 border-b border-border pb-4 last:border-b-0 last:pb-0">
                    {/* With one person the section's title says it all; the numbered heading comes with a second. */}
                    {values.tenants.length > 1 && (
                      <div className="flex min-h-8 items-center justify-between gap-2 pointer-coarse:min-h-11">
                        <p className="text-label text-fg-2">
                          Tenant {i + 1}
                          {i === 0 && values.tenants.length > 1 && <span className="text-muted-foreground"> (primary)</span>}
                        </p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          icon
                          aria-label={`Remove tenant ${i + 1}`}
                          onClick={() => {
                            for (const f of ["fullName", "phone", "email"]) clear(`tenants.${i}.${f}`);
                            set({
                              tenants: values.tenants.filter((_, k) => k !== i),
                            });
                          }}
                        >
                          <X aria-hidden="true" />
                        </Button>
                      </div>
                    )}
                    <FormField label="Name" required error={tenantLine(i, "fullName")}>
                      {(p) => (
                        <Input
                          {...p}
                          autoComplete="off"
                          autoCapitalize="words"
                          value={t.fullName}
                          onChange={(e) => {
                            clear(`tenants.${i}.fullName`);
                            patchTenant(i, { fullName: e.target.value });
                          }}
                        />
                      )}
                    </FormField>
                    <FieldRow>
                      <FormField label="Phone" optional error={tenantLine(i, "phone")}>
                        {(p) => (
                          <Input
                            {...p}
                            type="text"
                            inputMode="tel"
                            autoComplete="off"
                            value={t.phone}
                            onChange={(e) => {
                              clear(`tenants.${i}.phone`);
                              patchTenant(i, { phone: e.target.value });
                            }}
                          />
                        )}
                      </FormField>
                      <FormField label="Email" optional error={tenantLine(i, "email")}>
                        {(p) => (
                          <Input
                            {...p}
                            type="text"
                            inputMode="email"
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            autoComplete="off"
                            value={t.email}
                            onChange={(e) => {
                              clear(`tenants.${i}.email`);
                              patchTenant(i, { email: e.target.value });
                            }}
                          />
                        )}
                      </FormField>
                    </FieldRow>
                  </div>
                ))}
                {values.tenants.length < MAX_TENANTS && (
                  <AddRow className="border-t-0 px-0" onClick={() => change({ tenants: [...values.tenants, { ...BLANK_TENANT }] }, "tenants")}>
                    Add another tenant
                  </AddRow>
                )}
              </div>
            </Section>

            <Section as="h3" title="Dates">
              <div className="space-y-4">
                <FieldRow>
                  <PickField label="Moves in" optional error={errors.movesIn}>
                    <DateField
                      label="Moves in"
                      today={today}
                      value={values.movesIn}
                      isInvalid={!!errors.movesIn}
                      onChange={(movesIn) =>
                        // The first term starts the day they move in, until someone says otherwise.
                        change(values.startsOn ? { movesIn } : { movesIn, startsOn: movesIn }, "movesIn", "startsOn")
                      }
                    />
                  </PickField>
                </FieldRow>
                <FieldRow>
                  <PickField label="Starts" error={errors.startsOn}>
                    <DateField
                      label="Starts"
                      today={today}
                      value={values.startsOn}
                      isInvalid={!!errors.startsOn}
                      onChange={(startsOn) => change({ startsOn }, "startsOn", "endsOn")}
                    />
                  </PickField>
                  {!values.monthToMonth && (
                    <PickField label="Ends" error={errors.endsOn}>
                      <DateField
                        label="Ends"
                        today={today}
                        value={values.endsOn}
                        isInvalid={!!errors.endsOn}
                        onChange={(endsOn) => change({ endsOn }, "endsOn")}
                      />
                    </PickField>
                  )}
                </FieldRow>
                <label className="flex w-fit min-h-6 items-center gap-2 text-label text-fg-2 pointer-coarse:min-h-11">
                  <Checkbox checked={values.monthToMonth} onChange={(e) => change({ monthToMonth: e.target.checked, endsOn: null }, "endsOn")} />
                  Month to month
                </label>
              </div>
            </Section>

            <Section as="h3" title="Money">
              <div className="space-y-4">
                <FieldRow>
                  <FormField label="Rent" required error={errors.rent}>
                    {(p) => (
                      <NumberInput kind="money" suffix="/mo" {...p} value={values.rent} onChange={(rent) => change({ rent }, "rent", "subsidy")} />
                    )}
                  </FormField>
                  <FormField label="Deposit" optional error={errors.deposit}>
                    {(p) => <NumberInput kind="money" {...p} value={values.deposit} onChange={(deposit) => change({ deposit }, "deposit")} />}
                  </FormField>
                </FieldRow>
                <FieldRow>
                  <FormField label="Housing authority pays" optional error={errors.subsidy}>
                    {(p) => (
                      <NumberInput kind="money" suffix="/mo" {...p} value={values.subsidy} onChange={(subsidy) => change({ subsidy }, "subsidy")} />
                    )}
                  </FormField>
                  {hasSubsidy && (
                    <FormField label="Paid by" optional error={errors.subsidyFrom}>
                      {(p) => (
                        <Input
                          {...p}
                          autoComplete="off"
                          value={values.subsidyFrom}
                          onChange={(e) => change({ subsidyFrom: e.target.value }, "subsidyFrom")}
                        />
                      )}
                    </FormField>
                  )}
                </FieldRow>
              </div>
            </Section>
          </>
        );
      }}
    </CreateForm>
  );
}
