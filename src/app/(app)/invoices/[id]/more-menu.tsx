"use client";
import { Ban, RotateCcw, Undo2 } from "lucide-react";
import { RecordMoreMenu, type RecordMenuAction, type RecordMenuLast } from "@/components/record-archive";
import { useRun } from "@/components/use-run";
import type { InvoiceStage } from "@prisma/client";
import { approveInvoiceAction, backToReviewAction, markNotInvoiceAction, restoreInvoiceAction, undoPaidAction } from "./actions";

/**
 * The invoice page's ⋯ on the title line (docs/contractor-invoices-plan.md, 6.1 item 1; drawing 11), by stage: To
 * review is Copy link, then Not an invoice in red after a line. To pay adds Back to review first. Paid is Undo
 * paid first and Copy link, and nothing to clear. Not an invoice goes at once with a toast and Undo.
 */
export function InvoiceMenu({ invoiceId, stage, paidAt }: { invoiceId: string; stage: InvoiceStage; paidAt: string | null }) {
  const { run } = useRun();

  const backToReview = () =>
    run(() => backToReviewAction(invoiceId), {
      done: "Moved back to To review",
      key: `invoice:${invoiceId}:stage`,
      undo: () => approveInvoiceAction(invoiceId),
    });

  const undoPaid = () => {
    if (!paidAt) return;
    run(() => undoPaidAction(invoiceId, paidAt), { done: "Back in To pay", key: `invoice:${invoiceId}:stage` });
  };

  const notInvoice = (expected: "REVIEW" | "TO_PAY") =>
    run(() => markNotInvoiceAction(invoiceId, expected), {
      done: "Marked not an invoice",
      key: `invoice:${invoiceId}:stage`,
      undo: () => restoreInvoiceAction(invoiceId),
    });

  const actions: RecordMenuAction[] =
    stage === "TO_PAY"
      ? [{ label: "Back to review", icon: <RotateCcw />, onAction: backToReview }]
      : stage === "PAID"
        ? [{ label: "Undo paid", icon: <Undo2 />, onAction: undoPaid }]
        : [];
  const last: RecordMenuLast | null =
    stage === "REVIEW" || stage === "TO_PAY"
      ? { label: "Not an invoice", icon: <Ban />, destructive: true, onAction: () => notInvoice(stage) }
      : null;

  return <RecordMoreMenu id={invoiceId} href={`/invoices/${invoiceId}`} archived={false} actions={actions} last={last} />;
}
