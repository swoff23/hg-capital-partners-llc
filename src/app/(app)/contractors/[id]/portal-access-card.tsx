"use client";
import { useState, useTransition } from "react";
import { Copy, MessageSquareText } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast";
import { Badge, Button, Input, Section, buttonClass } from "@/components/ui";
import { callAction, type ActionResult } from "@/lib/action-result";
import { firstName } from "@/lib/names";
import type { PortalAccessState } from "@/lib/portal/access-state";
import { loginTextBody, smsHref } from "@/lib/portal/login-text";
import { cn } from "@/lib/utils";
import { createPortalLogin, removePortalAccess, resetPortalPassword, restorePortalAccess, signOutPortalEverywhere } from "../actions";

export type PortalAccountView = {
  id: string;
  email: string;
  /** Invited, Active or Access off (src/lib/portal/access-state.ts). */
  state: PortalAccessState;
  /** The line under it: "Not signed in yet", "Last seen 2d ago", or null. */
  line: string | null;
  /** Access was removed on the login, so Restore access brings it back; otherwise Remove access takes it away. */
  restorable: boolean;
  /** The contact is active. Restoring an inactive contact's login doesn't let them sign in yet. */
  contactActive: boolean;
};

/**
 * A neutral pill in every state. Badge tones are state (docs/brand-guidelines.md,
 * section 4): danger is late or failed, warn a partner's decision, ok done or
 * money in, and none of the three login states is one of those. The line
 * under Email ("Last seen 2d ago") carries Active (decision 22).
 */
const BADGE: Record<PortalAccessState, string> = {
  invited: "Invited",
  active: "Active",
  off: "Access off",
};

/** A fact beside its label, on the same 112px label column (96 on phones) as the Contact rail above. */
const detailRow = "grid grid-cols-[6rem_minmax(0,1fr)] items-baseline gap-3 sm:grid-cols-[7rem_minmax(0,1fr)]";

/**
 * Portal access (docs/asana-migration-plan.md §5.1, approved batch item 2):
 * create a contractor's login and show the starting password once, with Copy
 * and "Text login details" (an sms: link on this phone). With a login: its
 * state and one line on it, then Reset password (a new one, shown once), Sign
 * out everywhere and Remove access, or Restore access once removed. An
 * inactive contact's login reads Access off and drops Reset password and Sign
 * out everywhere (decision 22); Remove and Restore access stay.
 */
export function PortalAccessCard({
  contactId,
  contactName,
  defaultEmail,
  phone,
  staffName,
  appUrl,
  account,
}: {
  contactId: string;
  contactName: string;
  defaultEmail: string | null;
  phone: string | null;
  staffName: string;
  appUrl: string;
  account: PortalAccountView | null;
}) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [error, setError] = useState("");
  const [shown, setShown] = useState<{ email: string; password: string } | null>(null);
  const [confirm, setConfirm] = useState<"reset" | "remove" | null>(null);
  const first = firstName(contactName) || contactName;

  function act<T>(action: () => Promise<ActionResult<T>>, onOk: (data: T) => void) {
    setError("");
    start(async () => {
      const res = await callAction(action);
      if (res.ok) onOk(res.data);
      else setError(res.error);
    });
  }

  return (
    <Section title="Portal access" actions={account && <Badge>{BADGE[account.state]}</Badge>} className="@container">
      <div className="space-y-3">
        {shown && (
          <StartingPassword
            email={shown.email}
            password={shown.password}
            first={first}
            href={smsHref(phone, loginTextBody({ contactName, staffName, appUrl, email: shown.email, password: shown.password }))}
            onCopy={async () => {
              try {
                await navigator.clipboard.writeText(shown.password);
                toast({ message: "Password copied" });
              } catch {
                toast({ message: "Couldn't copy. Select the password instead." });
              }
            }}
          />
        )}

        {!account && !shown && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              act(() => createPortalLogin(contactId, email), (data) => setShown(data));
            }}
          >
            <label className="block">
              <span className="text-meta font-medium text-fg-2">Email</span>
              <Input
                type="email"
                required
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={`${first.toLowerCase() || "name"}@example.com`}
                className="mt-1.5"
              />
            </label>
            <Button type="submit" disabled={pending || !email.trim()}>
              {pending ? "Creating…" : "Create login"}
            </Button>
          </form>
        )}

        {account && (
          <>
            <dl className={detailRow}>
              <dt className="text-meta text-fg-3">Email</dt>
              <dd className="min-w-0">
                {/* The address they sign in with wraps rather than truncating, as the Contact rail's values do. */}
                <p className="text-body text-fg-1 wrap-anywhere">{account.email}</p>
                {account.line && <p className="truncate text-meta text-fg-3">{account.line}</p>}
              </dd>
            </dl>
            {account.state !== "off" && (
              // Side by side where they fit, stacked full width where they don't,
              // so neither label wraps. At touch sizes the pair needs 326px, so
              // the 320 rail beside Jobs on an iPad stacks them; a mouse's
              // smaller pair (292px) fits from 320.
              <div className="flex flex-col gap-2 @xs:pointer-fine:flex-row @xs:pointer-fine:items-center @min-[21rem]:flex-row @min-[21rem]:items-center">
                <Button variant="secondary" size="sm" disabled={pending} onClick={() => setConfirm("reset")}>
                  Reset password
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    act(
                      () => signOutPortalEverywhere(account.id),
                      (d) => toast({ message: d.count ? `Signed out of ${d.count} ${d.count === 1 ? "device" : "devices"}` : "No devices were signed in" }),
                    )
                  }
                >
                  Sign out everywhere
                </Button>
              </div>
            )}
            {account.restorable ? (
              <Button
                variant="secondary"
                size="sm"
                disabled={pending}
                onClick={() => act(() => restorePortalAccess(account.id), () => toast({ message: account.contactActive ? `${first} can sign in again` : "Access restored" }))}
              >
                Restore access
              </Button>
            ) : (
              <div className={cn(account.state !== "off" && "border-t border-line pt-3")}>
                <Button variant="danger" size="sm" disabled={pending} onClick={() => setConfirm("remove")}>
                  Remove access
                </Button>
              </div>
            )}
          </>
        )}

        {error && <p className="text-meta text-danger">{error}</p>}
      </div>

      {account && confirm === "reset" && (
        <ConfirmDialog
          title={`Reset ${first}'s password?`}
          body={`${first} is signed out everywhere and needs the new password to get back in.`}
          onClose={() => setConfirm(null)}
          actions={
            <Button
              size="sm"
              disabled={pending}
              onClick={() => {
                setConfirm(null);
                act(() => resetPortalPassword(account.id), (d) => setShown({ email: account.email, password: d.password }));
              }}
            >
              Reset password
            </Button>
          }
        />
      )}
      {account && confirm === "remove" && (
        <ConfirmDialog
          title={`Remove ${first}'s access?`}
          body={`${first} is signed out everywhere and can't sign in until you restore access.`}
          onClose={() => setConfirm(null)}
          actions={
            <Button
              variant="destructive"
              size="sm"
              disabled={pending}
              onClick={() => {
                setConfirm(null);
                setShown(null);
                act(() => removePortalAccess(account.id), () => toast({ message: `${first} can't sign in now` }));
              }}
            >
              Remove access
            </Button>
          }
        />
      )}
    </Section>
  );
}

/** The starting password, shown this once, with Copy and the text message. */
function StartingPassword({
  email,
  password,
  first,
  href,
  onCopy,
}: {
  email: string;
  password: string;
  first: string;
  href: string;
  onCopy: () => void;
}) {
  return (
    <div className="space-y-2.5 rounded-md bg-fill-1 p-3">
      <p className="text-meta text-fg-3 wrap-anywhere">Starting password for {email}</p>
      <div className="flex items-center gap-2">
        {/* Read character by character, so set like a code: Geist Mono in --fg-2, never
            wrapped (section 3). Straight on the panel's fill: a --surface box inside it
            would be a darker well in dark. */}
        <code className="min-w-0 flex-1 whitespace-nowrap font-mono text-code text-fg-2">{password}</code>
        <Button variant="secondary" size="sm" onClick={onCopy} aria-label="Copy password">
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          Copy
        </Button>
      </div>
      <a href={href} className={cn(buttonClass({ variant: "primary" }), "w-full")}>
        <MessageSquareText className="h-4 w-4" aria-hidden="true" />
        Text login details
      </a>
      <p className="text-meta text-fg-3">Shown once. {first} picks their own at first sign-in.</p>
    </div>
  );
}
