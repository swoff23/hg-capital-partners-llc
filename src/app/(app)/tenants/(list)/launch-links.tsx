"use client";
import { useState } from "react";
import { Send } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast";
import { Button, chromeIconClass } from "@/components/ui";
import { callAction } from "@/lib/action-result";
import { requestLinksPlan, sendRequestLinks, type LaunchPlan } from "./launch-actions";

const tenants = (n: number) => `${n} tenant${n === 1 ? "" : "s"}`;

/**
 * Email request links (docs/specs/maintenance-requests.md, section 4.5): the
 * launch-day send. It reads how many get a link first, then asks once. It
 * stays for later: once everyone with an email has theirs, the dialog says so
 * and offers nothing to send. An icon on a phone, so the header's two buttons
 * fit at 320.
 */
export function LaunchLinks() {
  const { toast } = useToast();
  const [plan, setPlan] = useState<LaunchPlan | null>(null);
  const [busy, setBusy] = useState(false);

  async function open() {
    setBusy(true);
    const res = await callAction(requestLinksPlan);
    setBusy(false);
    if (res.ok) setPlan(res.data);
    else toast({ message: res.error });
  }

  async function send() {
    setBusy(true);
    const res = await callAction(sendRequestLinks);
    setBusy(false);
    setPlan(null);
    if (!res.ok) return toast({ message: res.error });
    const { sent, failed } = res.data;
    toast({ message: failed ? `Links emailed to ${tenants(sent)}. ${failed} didn't send; try them from their lease.` : `Links emailed to ${tenants(sent)}` });
  }

  const missing = plan && plan.noEmail > 0 ? `${plan.noEmail} ${plan.noEmail === 1 ? "has" : "have"} no email. Copy theirs from their lease page.` : null;

  return (
    <>
      <Button variant="secondary" disabled={busy && !plan} onClick={open} className="max-sm:w-9 max-sm:px-0 pointer-coarse:max-sm:w-11">
        <Send aria-hidden="true" className={chromeIconClass} />
        <span className="max-sm:sr-only">Email maintenance request links</span>
      </Button>
      {plan && (
        <ConfirmDialog
          title={plan.count ? "Email maintenance request links?" : "Everyone has their link"}
          body={
            plan.count ? (
              <>
                <p>{tenants(plan.count)} {plan.count === 1 ? "gets" : "get"} their own link.</p>
                {missing && <p>{missing}</p>}
              </>
            ) : (
              missing
            )
          }
          onClose={() => setPlan(null)}
          cancelLabel={plan.count ? "Not now" : "Close"}
          busy={busy}
          actions={
            plan.count ? (
              <Button variant="primary" size="sm" disabled={busy} onClick={send}>
                {busy ? "Emailing…" : `Email ${plan.count}`}
              </Button>
            ) : null
          }
        />
      )}
    </>
  );
}
