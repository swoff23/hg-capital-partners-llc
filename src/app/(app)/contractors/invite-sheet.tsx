"use client";
import { useState } from "react";
import Link from "next/link";
import { Link2, UserPlus } from "lucide-react";
import { Button as AriaButton } from "react-aria-components";
import { Code } from "@/components/code";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormSheet } from "@/components/form-sheet";
import { PickerLayer } from "@/components/picker-layer";
import { useToast } from "@/components/toast";
import { Button, FormField, Input, buttonClass, chromeIconClass } from "@/components/ui";
import { useRun } from "@/components/use-run";
import { callAction } from "@/lib/action-result";
import { signupTextBody } from "@/lib/contractors/onboarding";
import { inlineProblem } from "@/lib/inline-edit";
import { cn } from "@/lib/utils";
import { getSignupLink, inviteContractor, resendContractorInvite, resetSignupLinkAction, type InviteHow } from "./invite-actions";
import { HOW_LABEL, OtherHows, deliverInvite, usePrimaryHow } from "./invite-delivery";

/**
 * The Contractors list's header (docs/specs/contractor-onboarding.md, 4.1): Invite contractor, the one primary, and
 * Sign-up link beside it. Below sm the Sign-up link button is only its icon (still named for a screen reader), so
 * the pair fits one row at 320; the popover's own title says what it is.
 */
export function ContractorHeaderActions() {
  const [inviting, setInviting] = useState(false);
  // Each open gets fresh fields: a key per open remounts the sheet, which stays mounted to slide out.
  const [inviteKey, setInviteKey] = useState(0);
  return (
    <div className="flex items-center gap-2">
      <SignupLink />
      <Button
        onClick={() => {
          setInviteKey((k) => k + 1);
          setInviting(true);
        }}
      >
        <UserPlus aria-hidden="true" className={chromeIconClass} />
        Invite contractor
      </Button>
      <InviteSheet key={inviteKey} isOpen={inviting} onOpenChange={setInviting} />
    </div>
  );
}

/**
 * Invite contractor (4.2): Name and Mobile or email, then the three ways to send. The device's primary is the
 * sheet's button, and Enter or the keyboard shortcut does that one; the other two sit under the fields.
 * "Add without inviting" is New contractor's form, for someone who'll never use the portal.
 */
function InviteSheet({ isOpen, onOpenChange }: { isOpen: boolean; onOpenChange: (open: boolean) => void }) {
  const [name, setName] = useState("");
  const [reach, setReach] = useState("");
  const [tried, setTried] = useState(false);
  const run = useRun();
  const hasEmail = reach.includes("@") && !inlineProblem("email", reach) && reach.trim() !== "";
  const primary = usePrimaryHow(hasEmail);

  const nameProblem = name.trim() ? null : "Enter a name.";
  const reachProblem = !reach.trim()
    ? "Enter a mobile number or an email."
    : inlineProblem(reach.includes("@") ? "email" : "phone", reach);

  function send(how: InviteHow) {
    setTried(true);
    if (nameProblem || reachProblem) return;
    run.run(() => deliverInvite(how, () => inviteContractor({ fullName: name, reach, how }), run.toast), {
      failure: "inline",
      succeeded: () => onOpenChange(false),
    });
  }

  const fieldErrors = run.fieldErrors;
  return (
    <FormSheet
      title="Invite contractor"
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onSubmit={() => send(primary)}
      primary={HOW_LABEL[primary]}
      pending={run.pending}
      values={{ name, reach }}
      discardTitle="Discard the invite?"
      leaveTitle="Leave the invite?"
      error={run.error && !fieldErrors ? run.error : undefined}
      fieldErrors={fieldErrors}
    >
      <FormField label="Name" required error={(tried && nameProblem) || fieldErrors?.fullName || undefined}>
        {(p) => (
          <Input
            {...p}
            autoComplete="off"
            value={name}
            onChange={(e) => {
              run.reset();
              setName(e.target.value);
            }}
          />
        )}
      </FormField>
      <FormField label="Mobile or email" required error={(tried && reachProblem) || fieldErrors?.reach || undefined}>
        {(p) => (
          <Input
            {...p}
            type="text"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="off"
            value={reach}
            onChange={(e) => {
              run.reset();
              setReach(e.target.value);
            }}
          />
        )}
      </FormField>
      <OtherHows primary={primary} hasEmail={hasEmail} pending={run.pending} onPick={send} />
      <Link href="/contractors/new" className="text-meta text-muted-foreground underline decoration-1 underline-offset-3 hover:text-foreground pointer-coarse:py-3">
        Add without inviting
      </Link>
    </FormSheet>
  );
}

/**
 * Resend on the contractor's page (4.4): the same three ways to send as the invite sheet. The new link replaces
 * the old one, so the old text or email stops working.
 */
export function ResendInviteSheet({
  contactId,
  first,
  hasEmail,
  isOpen,
  onOpenChange,
}: {
  contactId: string;
  first: string;
  hasEmail: boolean;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const run = useRun();
  const primary = usePrimaryHow(hasEmail);

  function send(how: InviteHow) {
    run.run(() => deliverInvite(how, () => resendContractorInvite(contactId, how), run.toast), {
      failure: "inline",
      succeeded: () => onOpenChange(false),
    });
  }

  return (
    <FormSheet
      title={`Resend ${first}'s invite`}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onSubmit={() => send(primary)}
      primary={HOW_LABEL[primary]}
      pending={run.pending}
      error={run.error}
    >
      <p className="-mt-1 text-body text-fg-2">A new link goes out. The old one stops working.</p>
      <OtherHows primary={primary} hasEmail={hasEmail} pending={run.pending} onPick={send} />
    </FormSheet>
  );
}

/**
 * Sign-up link (4.3): a popover on a computer and a tablet, a bottom sheet on a phone. The link in a Code that copies
 * on a tap, Copy message (the link with a line to go with it, for pasting into a text), and Reset link behind a
 * confirm. The link is read each time it opens, so a reset from another tab shows.
 */
function SignupLink() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [problem, setProblem] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLink(null);
    setProblem("");
    const res = await callAction(getSignupLink);
    if (res.ok) setLink(res.data.link);
    else setProblem(res.error);
  }

  async function reset() {
    setBusy(true);
    const res = await callAction(resetSignupLinkAction);
    setBusy(false);
    setConfirming(false);
    if (res.ok) {
      setLink(res.data.link);
      toast({ message: "Sign-up link reset. The old one no longer works." });
    } else {
      toast({ message: res.error });
    }
  }

  async function copyMessage() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(signupTextBody(link));
      toast({ message: "Message copied" });
    } catch {
      toast({ message: "Couldn't copy. Tap the link to copy it instead." });
    }
  }

  return (
    <>
      <PickerLayer
        isOpen={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) void load();
        }}
        title="Sign-up link"
        motion="pop"
        popoverClassName="max-w-80"
        trigger={
          <AriaButton className={cn(buttonClass({ variant: "secondary" }), "max-sm:w-9 max-sm:px-0 pointer-coarse:max-sm:w-11")}>
            <Link2 aria-hidden="true" className={chromeIconClass} />
            <span className="max-sm:sr-only">Sign-up link</span>
          </AriaButton>
        }
      >
        {({ container }) => (
          <div className={cn("space-y-3", container === "sheet" ? "p-4" : "p-3")}>
            {container === "popover" && <p className="text-label text-foreground">Sign-up link</p>}
            {problem ? (
              <p className="text-meta text-destructive">{problem}</p>
            ) : link ? (
              <Code value={link} label="Sign-up link" wrap />
            ) : (
              <p className="text-meta text-muted-foreground">Getting the link</p>
            )}
            <p className="text-meta text-muted-foreground">New sign-ups wait for a partner to keep them.</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button variant="secondary" size="sm" disabled={!link} onClick={copyMessage}>
                Copy message
              </Button>
              <Button
                variant="danger"
                size="sm"
                disabled={!link}
                onClick={() => {
                  setOpen(false);
                  setConfirming(true);
                }}
              >
                Reset link
              </Button>
            </div>
          </div>
        )}
      </PickerLayer>
      {confirming && (
        <ConfirmDialog
          title="Reset the sign-up link?"
          body="Anyone with the old link won't be able to sign up."
          busy={busy}
          onClose={() => setConfirming(false)}
          actions={
            <Button variant="destructive" size="sm" disabled={busy} onClick={reset}>
              Reset link
            </Button>
          }
        />
      )}
    </>
  );
}
