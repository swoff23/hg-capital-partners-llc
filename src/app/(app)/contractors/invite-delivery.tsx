"use client";
import { Copy, Mail, MessageSquareText } from "lucide-react";
import { useCoarsePointer } from "@/components/use-coarse-pointer";
import { Button } from "@/components/ui";
import type { useToast } from "@/components/toast";
import { callAction, type ActionResult } from "@/lib/action-result";
import { inviteTextBody } from "@/lib/contractors/onboarding";
import { smsHref } from "@/lib/portal/login-text";
import type { InviteHow, InviteSent } from "./invite-actions";

/*
 * The three ways to hand over an invite link, shared by Invite contractor and Resend (spec 4.2): Text invite opens
 * Messages with the text filled in, Email invite sends it from the app, Copy link puts it on the clipboard.
 */

export const HOW_LABEL: Record<InviteHow, string> = { text: "Text invite", email: "Email invite", copy: "Copy link" };

const HOW_ICON = { text: MessageSquareText, email: Mail, copy: Copy } as const;

/**
 * The device's primary: Text invite on a touch screen, where Messages is the way people send these; on a computer
 * Email invite once there's an email, otherwise Copy link, which works anywhere.
 */
export function usePrimaryHow(hasEmail: boolean): InviteHow {
  const touch = useCoarsePointer();
  if (touch) return "text";
  return hasEmail ? "email" : "copy";
}

/** The two choices that aren't the primary, as secondary buttons. Email invite is off until there's an email. */
export function OtherHows({
  primary,
  hasEmail,
  pending,
  onPick,
}: {
  primary: InviteHow;
  hasEmail: boolean;
  pending: boolean;
  onPick: (how: InviteHow) => void;
}) {
  const others = (["text", "email", "copy"] as const).filter((h) => h !== primary);
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      {others.map((h) => {
        const Icon = HOW_ICON[h];
        return (
          <Button
            key={h}
            type="button"
            variant="secondary"
            className="max-sm:w-full"
            disabled={pending || (h === "email" && !hasEmail)}
            onClick={() => onPick(h)}
          >
            <Icon className="size-4" aria-hidden="true" />
            {HOW_LABEL[h]}
          </Button>
        );
      })}
    </div>
  );
}

type Toast = ReturnType<typeof useToast>["toast"];

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Make the invite (`make` is the server action) and hand it over. The clipboard write starts before the action
 * answers, with the link arriving as a promise, so Safari still counts it as part of the tap. A refusal comes
 * back untouched for the sheet to show in place.
 */
export async function deliverInvite(how: InviteHow, make: () => Promise<ActionResult<InviteSent>>, toast: Toast): Promise<ActionResult<InviteSent>> {
  const made = callAction(make);
  let early: Promise<boolean> | null = null;
  if (how === "copy" && typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    const blob = made.then((r) => {
      if (!r.ok) throw new Error(r.error);
      return new Blob([r.data.link], { type: "text/plain" });
    });
    early = navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]).then(
      () => true,
      () => false,
    );
  }
  const res = await made;
  if (!res.ok) return res;
  const d = res.data;
  if (how === "copy") {
    const copied = early ? await early : await copyText(d.link);
    toast({ message: copied ? "Invite link copied" : "Couldn't copy the link. Try Text invite." });
  } else if (how === "email") {
    toast({ message: d.emailed ? (d.firstName ? `${d.firstName}'s invite sent` : "Invite sent") : "The email didn't send. Copy the link or text it." });
  } else {
    // Messages opens with the text ready; nothing says it was sent, so the toast says it's ready.
    window.location.href = smsHref(d.phone, inviteTextBody({ contractorFirstName: d.firstName, senderFirstName: d.senderFirstName, link: d.link }));
    toast({ message: d.firstName ? `${d.firstName}'s invite text is ready` : "Invite text is ready" });
  }
  return res;
}
