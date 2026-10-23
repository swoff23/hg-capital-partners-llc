"use client";
import { useState, useTransition } from "react";
import { Copy, MessageSquareText } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Input, buttonClass } from "@/components/ui";
import type { ActionResult } from "@/lib/action-result";
import { firstName } from "@/lib/names";
import { loginTextBody, smsHref } from "@/lib/portal/login-text";
import { cn } from "@/lib/utils";
import { createPortalLogin, removePortalAccess, resetPortalPassword, restorePortalAccess, signOutPortalEverywhere } from "../actions";

export type PortalAccountView = {
  id: string;
  email: string;
  active: boolean;
  /** "Oct 20, 2026, 3:14 PM", or null when they haven't signed in. */
  lastSignIn: string | null;
};

/**
 * Portal access (docs/asana-migration-plan.md §5.1, approved batch item 2):
 * create a contractor's login and show the starting password once, with Copy
 * and "Text login details" (an sms: link on this phone). With a login:
 * status, last sign-in, Reset password (a new one, shown once), Sign out
 * everywhere, Remove access and Restore access.
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
      const res = await action();
      if (res.ok) onOk(res.data);
      else setError(res.error);
    });
  }

  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-2">
        <CardTitle>Portal access</CardTitle>
        {account && <Badge tone={account.active ? "green" : "gray"}>{account.active ? "Active" : "Removed"}</Badge>}
      </CardHeader>
      <CardBody className="space-y-3">
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
              <span className="text-xs font-medium text-muted">Email</span>
              <Input
                type="email"
                required
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={`${first.toLowerCase() || "name"}@example.com`}
                className="mt-1"
              />
            </label>
            <Button type="submit" disabled={pending || !email.trim()}>
              {pending ? "Creating…" : "Create login"}
            </Button>
          </form>
        )}

        {account && (
          <>
            <dl className="space-y-1 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="shrink-0 text-xs text-muted">Email</dt>
                <dd className="min-w-0 truncate">{account.email}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="shrink-0 text-xs text-muted">Last signed in</dt>
                <dd className="min-w-0 truncate">{account.lastSignIn ?? "Not yet"}</dd>
              </div>
            </dl>
            {account.active ? (
              <>
                <div className="flex items-center gap-2">
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
                <div className="border-t border-border pt-3">
                  <Button variant="danger" size="sm" disabled={pending} onClick={() => setConfirm("remove")}>
                    Remove access
                  </Button>
                </div>
              </>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                disabled={pending}
                onClick={() => act(() => restorePortalAccess(account.id), () => toast({ message: `${first} can sign in again` }))}
              >
                Restore access
              </Button>
            )}
          </>
        )}

        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      </CardBody>

      {account && confirm === "reset" && (
        <ConfirmDialog
          title={`Reset ${first}'s password?`}
          body={`${first} is signed out everywhere and needs the new password to get back in.`}
          onClose={() => setConfirm(null)}
          actions={
            <>
              <Button variant="secondary" size="sm" onClick={() => setConfirm(null)}>
                Cancel
              </Button>
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
            </>
          }
        />
      )}
      {account && confirm === "remove" && (
        <ConfirmDialog
          title={`Remove ${first}'s access?`}
          body={`${first} is signed out everywhere and can't sign in until you restore access.`}
          onClose={() => setConfirm(null)}
          actions={
            <>
              <Button variant="secondary" size="sm" onClick={() => setConfirm(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
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
            </>
          }
        />
      )}
    </Card>
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
    <div className="space-y-2.5 rounded-lg border border-border bg-background p-3">
      <p className="truncate text-xs text-muted">Starting password for {email}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md bg-surface px-2.5 py-1.5 font-mono text-sm ring-1 ring-inset ring-border">
          {password}
        </code>
        <Button variant="secondary" size="sm" onClick={onCopy} aria-label="Copy password">
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          Copy
        </Button>
      </div>
      <a href={href} className={cn(buttonClass({ variant: "primary" }), "w-full")}>
        <MessageSquareText className="h-4 w-4" aria-hidden="true" />
        Text login details
      </a>
      <p className="text-xs text-muted">Shown once. {first} picks their own at first sign-in.</p>
    </div>
  );
}
