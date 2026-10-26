"use client";
import { useState, useTransition } from "react";
import { Copy, MessageSquareText, MoreHorizontal, Pencil } from "lucide-react";
import { Button as AriaButton } from "react-aria-components";
import { Code } from "@/components/code";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormSheet } from "@/components/form-sheet";
import { Menu, MenuItem, MenuTrigger } from "@/components/menu";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import { Badge, Button, FormField, Input, Section, buttonClass } from "@/components/ui";
import { pickContainer } from "@/components/use-coarse-pointer";
import { useRun } from "@/components/use-run";
import { callAction, type ActionResult } from "@/lib/action-result";
import { inlineProblem } from "@/lib/inline-edit";
import { firstName } from "@/lib/names";
import type { PortalAccessState } from "@/lib/portal/access-state";
import { loginTextBody, smsHref } from "@/lib/portal/login-text";
import { cn } from "@/lib/utils";
import {
  changePortalLoginEmail,
  createPortalLogin,
  removePortalAccess,
  resetPortalPassword,
  restorePortalAccess,
  signOutPortalEverywhere,
} from "../actions";

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

/** The starting password handed over once, with the email it goes with. */
type Shown = { email: string; password: string; phone: boolean };

/**
 * Portal access (docs/asana-migration-plan.md §5.1, approved batch item 2;
 * forms 4.6): create a contractor's login and hand over the starting password
 * once. Create login opens a sheet: the email (prefilled, and saved as the
 * contact's own when it has none) and a line on what happens. The payoff is
 * a sheet of its own: the password as a code, and the right primary for the
 * device, "Copy message" on a computer and "Text login details" on a phone.
 * With a login: its state and one line on it, then Reset password (a new one,
 * shown the same way), Sign out everywhere and Remove access, or Restore
 * access once removed. "Change login email" is in the card's ⋯ menu, a small
 * sheet that says Zack signs in with it from now on, not an in-place edit,
 * since it changes how someone signs in. An inactive contact's login reads
 * Access off and drops Reset password and Sign out everywhere (decision 22).
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
  const [error, setError] = useState("");
  const [shown, setShown] = useState<Shown | null>(null);
  const [payoffOpen, setPayoffOpen] = useState(false);
  // Each open gets fresh fields: a key per open remounts the sheet, which stays mounted to slide out.
  const [creating, setCreating] = useState(false);
  const [createKey, setCreateKey] = useState(0);
  const [changing, setChanging] = useState(false);
  const [changeKey, setChangeKey] = useState(0);
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

  /** The payoff: the password and the right primary for this device. */
  function handOver(email: string, password: string) {
    setShown({ email, password, phone: pickContainer() === "sheet" });
    setPayoffOpen(true);
  }

  return (
    <Section
      title="Portal access"
      actions={
        account && (
          <>
            <Badge>{BADGE[account.state]}</Badge>
            <MenuTrigger>
              <AriaButton
                aria-label="Portal access actions"
                className={cn(buttonClass({ variant: "ghost", size: "sm", icon: true }), "-mr-2 text-fg-3 data-pressed:bg-fill-1")}
              >
                <MoreHorizontal aria-hidden="true" strokeWidth={1.5} className="size-4" />
              </AriaButton>
              <Menu sheetTitle="Portal access">
                <MenuItem
                  icon={<Pencil />}
                  onAction={() => {
                    setChangeKey((k) => k + 1);
                    setChanging(true);
                  }}
                >
                  Change login email
                </MenuItem>
              </Menu>
            </MenuTrigger>
          </>
        )
      }
      className="@container"
    >
      <div className="space-y-3">
        {!account && (
          <div className="space-y-2">
            <p className="text-meta text-fg-3">No login yet.</p>
            <Button
              onClick={() => {
                setCreateKey((k) => k + 1);
                setCreating(true);
              }}
            >
              Create login
            </Button>
          </div>
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

      {!account && (
        <CreateLoginSheet
          key={createKey}
          contactId={contactId}
          first={first}
          defaultEmail={defaultEmail}
          isOpen={creating}
          onOpenChange={setCreating}
          onCreated={handOver}
        />
      )}
      {account && (
        <ChangeEmailSheet key={changeKey} accountId={account.id} first={first} email={account.email} isOpen={changing} onOpenChange={setChanging} />
      )}
      {shown && (
        <PayoffSheet
          isOpen={payoffOpen}
          onOpenChange={setPayoffOpen}
          shown={shown}
          first={first}
          phone={phone}
          contactName={contactName}
          staffName={staffName}
          appUrl={appUrl}
        />
      )}

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
                act(() => resetPortalPassword(account.id), (d) => handOver(account.email, d.password));
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

/**
 * Create login (forms 4.6, BCONTRACT-013): the email, prefilled from the
 * contact, and one line on what happens. When the contact has no email of its
 * own the helper says the login's is saved as theirs too. A refusal ("That
 * email belongs to a staff login.") sits under the field and keeps what was
 * typed; the starting password comes back once, to the payoff.
 */
function CreateLoginSheet({
  contactId,
  first,
  defaultEmail,
  isOpen,
  onOpenChange,
  onCreated,
}: {
  contactId: string;
  first: string;
  defaultEmail: string | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (email: string, password: string) => void;
}) {
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [tried, setTried] = useState(false);
  const run = useRun();
  const problem = !email.trim() ? "Enter an email, like name@example.com." : inlineProblem("email", email);
  const shownProblem = (tried && problem) || run.error || undefined;

  function submit() {
    setTried(true);
    if (problem) return;
    run.run(() => createPortalLogin(contactId, email), {
      failure: "inline",
      succeeded: (created) => {
        onOpenChange(false);
        onCreated(created.email, created.password);
      },
    });
  }

  return (
    <FormSheet
      title="Create login"
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onSubmit={submit}
      primary="Create login"
      pending={run.pending}
      values={email}
      dirty={email !== (defaultEmail ?? "")}
      discardTitle="Discard the new login?"
      leaveTitle="Leave the new login?"
      fieldErrors={run.error ? { email: run.error } : undefined}
    >
      <p className="-mt-1 text-body text-fg-2">{first} gets a starting password and picks a new one at first sign-in.</p>
      <FormField
        label="Email"
        required
        helper={defaultEmail ? undefined : `Also saved as ${first}'s contact email`}
        error={shownProblem}
      >
        {(p) => (
          <Input
            {...p}
            type="text"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="off"
            value={email}
            onChange={(e) => {
              run.reset();
              setEmail(e.target.value);
            }}
          />
        )}
      </FormField>
    </FormSheet>
  );
}

/** Change login email (forms 4.6): a small sheet, not a field that saves on a stray blur, since it changes how someone signs in. */
function ChangeEmailSheet({
  accountId,
  first,
  email: current,
  isOpen,
  onOpenChange,
}: {
  accountId: string;
  first: string;
  email: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [email, setEmail] = useState(current);
  const [tried, setTried] = useState(false);
  const run = useRun();
  const problem = !email.trim() ? "Enter an email, like name@example.com." : inlineProblem("email", email);
  const shownProblem = (tried && problem) || run.error || undefined;

  function submit() {
    setTried(true);
    if (problem) return;
    if (email.trim().toLowerCase() === current) return onOpenChange(false);
    run.run(() => changePortalLoginEmail(accountId, email), {
      failure: "inline",
      succeeded: () => onOpenChange(false),
      done: `${first} signs in with ${email.trim().toLowerCase()} now`,
    });
  }

  return (
    <FormSheet
      title="Change login email"
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onSubmit={submit}
      primary="Save email"
      pending={run.pending}
      values={email}
      dirty={email.trim().toLowerCase() !== current}
      discardTitle="Discard the change?"
      leaveTitle="Leave the email change?"
      fieldErrors={run.error ? { email: run.error } : undefined}
    >
      <FormField label="Email" required helper={`${first} signs in with this from now on`} error={shownProblem}>
        {(p) => (
          <Input
            {...p}
            type="text"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="off"
            value={email}
            onChange={(e) => {
              run.reset();
              setEmail(e.target.value);
            }}
          />
        )}
      </FormField>
    </FormSheet>
  );
}

/**
 * The payoff (forms 4.6): the starting password, shown this once, as a code
 * that copies on a tap, and the primary the device calls for. On a computer
 * "Copy message" puts the whole text on the clipboard to paste into whatever
 * they use; on a phone "Text login details" opens Messages with it filled in.
 * Done closes it.
 */
function PayoffSheet({
  isOpen,
  onOpenChange,
  shown,
  first,
  phone,
  contactName,
  staffName,
  appUrl,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  shown: Shown;
  first: string;
  phone: string | null;
  contactName: string;
  staffName: string;
  appUrl: string;
}) {
  const { toast } = useToast();
  const body = loginTextBody({ contactName, staffName, appUrl, email: shown.email, password: shown.password });

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(body);
      toast({ message: "Message copied" });
    } catch {
      toast({ message: "Couldn't copy. Select the password instead." });
    }
  }

  return (
    <Sheet
      title={`Login for ${first}`}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      footer={
        <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Done
          </Button>
          {shown.phone ? (
            <a href={smsHref(phone, body)} className={cn(buttonClass({ variant: "primary" }), "w-full md:w-auto")}>
              <MessageSquareText className="h-4 w-4" aria-hidden="true" />
              Text login details
            </a>
          ) : (
            <Button onClick={copyMessage}>
              <Copy className="h-4 w-4" aria-hidden="true" />
              Copy message
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-3 p-4">
        <p className="text-meta text-fg-3 wrap-anywhere">Starting password for {shown.email}</p>
        <Code value={shown.password} label="Starting password" size="lg" />
        <p className="text-meta text-fg-3">Shown once. {first} picks their own at first sign-in.</p>
      </div>
    </Sheet>
  );
}
