"use client";
import { useState, type ReactNode } from "react";
import { Button, Input, SaveError, SectionCard, Select, Textarea } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast";
import { readContactPatch, type ContactField } from "@/lib/contractors/contact-fields";
import { LabeledField } from "@/app/(app)/properties/labeled-field";
import { useSectionSave } from "@/app/(app)/properties/[id]/use-section-save";
import { patchContact } from "../actions";

/** The Contact columns staff can edit, as the page loaded them. */
export type EditableContact = {
  id: string;
  fullName: string;
  company: string | null;
  trades: string | null;
  phone: string | null;
  email: string | null;
  mailingAddress: string | null;
  billingInfo: string | null;
  availability: string | null;
  tenantFixes: boolean;
  comments: string | null;
};

type FieldProps = {
  name: ContactField;
  /** The visible label. A textarea or select inside its <label> would otherwise take its own text into its name. */
  "aria-label": string;
  "aria-invalid"?: true;
  "aria-describedby"?: string;
};

/**
 * One field: its label above, then one line under it, the helper or, once a
 * save was refused for this field, the reason in its place.
 */
function Row({
  name,
  label,
  helper,
  formId,
  invalid,
  error,
  children,
}: {
  name: ContactField;
  label: string;
  helper?: string;
  formId: string;
  invalid: string | null;
  error: string | null;
  children: (props: FieldProps) => ReactNode;
}) {
  const bad = invalid === name;
  const lineId = `${formId}-${name}-line`;
  const line = bad ? error : helper;
  return (
    <div>
      <LabeledField label={label}>
        {children({ name, "aria-label": label, "aria-invalid": bad || undefined, "aria-describedby": line ? lineId : undefined })}
      </LabeledField>
      {bad ? (
        <SaveError id={lineId} className="mt-1.5">
          {error}
        </SaveError>
      ) : helper ? (
        <p id={lineId} className="mt-1.5 text-meta text-fg-3">
          {helper}
        </p>
      ) : null}
    </div>
  );
}

/**
 * A one-line field. A stored value with a line break gets a textarea instead,
 * because a text input drops line breaks and opening the form would turn
 * that into a change nobody made.
 */
function LineField({ value, ...props }: FieldProps & { value: string | null; autoCapitalize?: string; "aria-required"?: boolean }) {
  return value?.includes("\n") ? <Textarea rows={2} defaultValue={value} {...props} /> : <Input defaultValue={value ?? ""} {...props} />;
}

/**
 * The Contact section of a contractor's page. `children` is the read view the
 * page renders; Edit swaps it for one short form of the Contact columns,
 * saved through useSectionSave like the property record's sections. Only the
 * fields that changed are sent. A dirty Cancel, or Esc in the form, asks
 * before it drops the changes. W-9, insurance and the portal login aren't
 * edited here.
 */
export function ContactSection({
  contact,
  portalEmail,
  children,
}: {
  contact: EditableContact;
  /** The portal sign-in email, which this form doesn't change; null without a login. */
  portalEmail: string | null;
  children: ReactNode;
}) {
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const { loaded: f, open, close, pending, error, invalid, onSubmit, onInput, formRef, isDirty } = useSectionSave(contact.id, contact, {
    save: patchContact,
    check: (changes) => {
      const r = readContactPatch(changes);
      return r.ok ? null : { field: r.field, message: r.message };
    },
    onSaved: () => toast({ message: "Contact saved" }),
  });
  const formId = `contact-${contact.id}`;

  if (!f) {
    return (
      <SectionCard title="Contact" onEdit={() => open("fullName")}>
        {children}
      </SectionCard>
    );
  }

  function cancel() {
    if (isDirty()) setConfirming(true);
    else close();
  }

  const row = { formId, invalid, error };
  return (
    <SectionCard
      title="Contact"
      editing
      actions={
        <>
          <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={cancel}>
            Cancel
          </Button>
          <Button type="submit" form={formId} size="sm" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        ref={formRef}
        onSubmit={onSubmit}
        onInput={onInput}
        onKeyDown={(e) => {
          if (e.key !== "Escape" || e.nativeEvent.isComposing || pending) return;
          e.preventDefault();
          cancel();
        }}
        noValidate
        autoComplete="off"
        className="space-y-3"
      >
        {/* A refusal that belongs to no field (no signal, someone else saved) sits by Save. */}
        {error && !invalid && <SaveError>{error}</SaveError>}
        <Row name="fullName" label="Name" {...row}>
          {(p) => <LineField value={f.fullName} aria-required autoCapitalize="words" {...p} />}
        </Row>
        <Row name="company" label="Company" {...row}>
          {(p) => <LineField value={f.company} {...p} />}
        </Row>
        <Row name="trades" label="Trades" {...row}>
          {(p) => <LineField value={f.trades} {...p} />}
        </Row>
        <Row name="phone" label="Phone" {...row}>
          {(p) => <Input type="tel" defaultValue={f.phone ?? ""} {...p} />}
        </Row>
        <Row name="email" label="Email" helper={portalEmail ? `Portal sign-in stays ${portalEmail}` : undefined} {...row}>
          {(p) => (
            <Input type="email" defaultValue={f.email ?? ""} autoCapitalize="none" autoCorrect="off" spellCheck={false} {...p} />
          )}
        </Row>
        <Row name="mailingAddress" label="Mailing address" {...row}>
          {(p) => <Textarea rows={2} defaultValue={f.mailingAddress ?? ""} {...p} />}
        </Row>
        <Row name="billingInfo" label="Billing" helper="How they're paid. No account numbers." {...row}>
          {(p) => <LineField value={f.billingInfo} {...p} />}
        </Row>
        <Row name="availability" label="Availability" {...row}>
          {(p) => <LineField value={f.availability} {...p} />}
        </Row>
        <Row name="tenantFixes" label="Tenant fixes" {...row}>
          {(p) => (
            <Select defaultValue={f.tenantFixes ? "yes" : "no"} {...p}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Select>
          )}
        </Row>
        <Row name="comments" label="Notes" {...row}>
          {(p) => <Textarea rows={4} defaultValue={f.comments ?? ""} {...p} />}
        </Row>
      </form>

      {confirming && (
        <ConfirmDialog
          title={`Discard changes to ${contact.fullName}?`}
          cancelLabel="Keep editing"
          onClose={() => setConfirming(false)}
          actions={
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                setConfirming(false);
                close();
              }}
            >
              Discard changes
            </Button>
          }
        />
      )}
    </SectionCard>
  );
}
