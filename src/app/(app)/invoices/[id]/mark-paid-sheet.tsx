"use client";
import { useState, useTransition } from "react";
import { DatePicker } from "@/components/due-date-picker";
import { FormSheet } from "@/components/form-sheet";
import { Select } from "@/components/select";
import { useToast } from "@/components/toast";
import { FormField, Input, PickField } from "@/components/ui";
import { callAction, type FieldErrors } from "@/lib/action-result";
import type { Ymd } from "@/lib/dates";
import { DEFAULT_PAY_METHOD, PAY_METHODS, PAY_METHOD_LABEL } from "@/lib/invoices/fields";
import { formatCents } from "@/lib/invoices/email-content";
import { markPaidAction, undoPaidAction } from "./actions";

const METHOD_ITEMS = PAY_METHODS.map((m) => ({ id: m, label: PAY_METHOD_LABEL[m] }));

/**
 * Mark paid (docs/contractor-invoices-plan.md, M8 and 6.1 item 5): a FormSheet with the day (today to start), how
 * and an optional check number or note, the total riding in the primary. It puts focus nowhere, so a phone's
 * keyboard doesn't jump up for an optional note. On success the sheet closes and a toast says who hears, with Undo
 * for as long as the toast stays. If the other partner marked it first, the sheet closes, the page already shows
 * Paid, and the toast says so.
 */
export function MarkPaidSheet({
  invoiceId,
  title,
  totalCents,
  today,
  onClose,
}: {
  invoiceId: string;
  /** "Invoice #1043": the sheet's title reads "Invoice #1043 paid". */
  title: string;
  totalCents: number | null;
  today: Ymd;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [paidOn, setPaidOn] = useState<Ymd>(today);
  const [method, setMethod] = useState<string>(DEFAULT_PAY_METHOD);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  function undo(paidAt: string) {
    return callAction(() => undoPaidAction(invoiceId, paidAt)).then((r) => {
      if (!r.ok) toast({ message: r.error });
    });
  }

  function submit() {
    setError(undefined);
    setFieldErrors({});
    start(async () => {
      const res = await callAction(() => markPaidAction(invoiceId, { paidOn, method, note: note.trim() || null }));
      if (!res.ok) {
        const lost = res.fieldErrors?.stage;
        if (lost) {
          // The other partner got there first: the page behind already shows Paid.
          onClose();
          toast({ message: lost });
          return;
        }
        const fields = res.fieldErrors ?? {};
        setFieldErrors(fields);
        if (!fields.paidOn && !fields.method && !fields.paidNote) setError(res.error);
        return;
      }
      onClose();
      const { paidAt, detail } = res.data;
      toast({
        message: "Marked paid",
        phoneMessage: "Paid",
        ...(detail ? { detail } : {}),
        key: `invoice:${invoiceId}:paid`,
        action: { label: "Undo", onAction: () => undo(paidAt) },
      });
    });
  }

  return (
    <FormSheet
      title={`${title} paid`}
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      primary={totalCents != null ? `Mark paid · ${formatCents(totalCents)}` : "Mark paid"}
      pending={pending}
      error={error}
      values={{ paidOn, method, note }}
      discardTitle="Discard this payment?"
      leaveTitle="Leave without marking it paid?"
      fieldErrors={fieldErrors}
      focusFirstField={false}
      onSubmit={submit}
    >
      <PickField label="Paid on" error={fieldErrors.paidOn}>
        <DatePicker variant="field" label="Paid on" today={today} allowNone={false} value={paidOn} onChange={(v) => v && setPaidOn(v)} />
      </PickField>
      <PickField label="Method" error={fieldErrors.method}>
        <Select aria-label="Method" title="Method" items={METHOD_ITEMS} value={method} onChange={(v) => v && setMethod(v)} />
      </PickField>
      <FormField label="Check # or note" optional error={fieldErrors.paidNote}>
        {(p) => <Input {...p} name="note" value={note} maxLength={200} autoComplete="off" onChange={(e) => setNote(e.target.value)} />}
      </FormField>
    </FormSheet>
  );
}
