"use client";
import { useTransition } from "react";
import { LogOut } from "lucide-react";
import { Button as AriaButton } from "react-aria-components";
import { Avatar } from "@/components/avatar";
import { useLeaveGuard } from "@/components/leave-guard";
import { Menu, MenuHeader, MenuItem, MenuSection, MenuSeparator, MenuTrigger } from "@/components/menu";
import { THEME_PREFS, useThemePref } from "@/components/theme-toggle";
import { useToast } from "@/components/toast";
import { callAction } from "@/lib/action-result";

/**
 * The signed-in person's menu (docs/specs/selectors.md 3.5), the one way to
 * the Theme and Sign out at every size. The trigger is the row at the foot of
 * the rail and the phone drawer: the avatar with the name and email beside
 * it. It opens upward onto their name over their email, the Theme (System,
 * Light or Dark, with a Check on the pick) and Sign out. Settings isn't here;
 * the sidebar's already opens it. It sits in the sidebar footer, shadcn's
 * nav-user pattern (Connor, Nov 14), so the app bar carries no avatar.
 *
 * Sign out goes through `useLeaveGuard({ signOut: true })`, which asks first
 * while a hold is on in the LeaveGuard the app layout wraps around the shell:
 * a dirty form (scope "all") or, once the upload queue holds it, uploads in
 * flight (scope "sign-out"). `signOutAction` is the server action that ends
 * the session and redirects to sign-in.
 */
export function AccountMenu({
  name,
  email,
  signOutAction,
}: {
  /** The person's name, or null when they have none and the email stands in for it. */
  name: string | null;
  email: string;
  signOutAction: () => Promise<void> | void;
}) {
  const { toast } = useToast();
  const guard = useLeaveGuard({ signOut: true });
  const [pending, startTransition] = useTransition();
  const [pref, setPref] = useThemePref();
  const label = name ?? email;

  function signOut() {
    guard(() =>
      startTransition(async () => {
        // Success redirects to sign-in, which callAction lets through.
        const res = await callAction(async () => {
          await signOutAction();
          return { ok: true as const, data: undefined };
        });
        if (!res.ok) toast({ message: res.error });
      }),
    );
  }

  return (
    <MenuTrigger>
      <AriaButton
        aria-label={`Account, ${label}`}
        // 10px in, so the 28px avatar centers on the rail's icons; the words truncate and the collapsed rail clips them.
        className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left outline-none transition-colors hover:bg-muted data-pressed:bg-muted data-focus-visible:outline-solid data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-ring pointer-coarse:min-h-11"
      >
        <Avatar name={name} email={email} size={28} />
        <span className="min-w-0 flex-1 overflow-hidden whitespace-nowrap">
          <span className="block truncate text-meta font-medium text-foreground">{label}</span>
          {name && <span className="block truncate text-meta text-muted-foreground">{email}</span>}
        </span>
      </AriaButton>
      <Menu placement="top start" aria-label="Account">
        <MenuHeader title={label} detail={name ? email : undefined} />
        <MenuSeparator />
        <MenuSection
          title="Theme"
          selectionMode="single"
          selectedKeys={[pref]}
          onSelectionChange={(keys) => {
            const next = [...keys][0];
            if (next === "system" || next === "light" || next === "dark") setPref(next);
          }}
        >
          {THEME_PREFS.map((t) => (
            <MenuItem key={t.key} id={t.key}>
              {t.label}
            </MenuItem>
          ))}
        </MenuSection>
        <MenuSeparator />
        <MenuItem id="sign-out" icon={<LogOut aria-hidden="true" />} isDisabled={pending} onAction={signOut}>
          Sign out
        </MenuItem>
      </Menu>
    </MenuTrigger>
  );
}
