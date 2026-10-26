"use client";
import { useTransition } from "react";
import { LogOut } from "lucide-react";
import { Button as AriaButton } from "react-aria-components";
import { Avatar } from "@/components/avatar";
import { useLeaveGuard } from "@/components/leave-guard";
import { Menu, MenuHeader, MenuItem, MenuSeparator, MenuTrigger } from "@/components/menu";
import { useToast } from "@/components/toast";
import { callAction } from "@/lib/action-result";
import { signOutPortal } from "../actions";

/**
 * The contractor's initials, opening a menu with their name over their
 * email, so they can see which account they're in, and Sign out. Sign out
 * asks first while photos are still uploading (`useLeaveGuard({ signOut: true })`).
 */
export function AccountMenu({ name, email }: { name: string; email: string }) {
  const { toast } = useToast();
  const guard = useLeaveGuard({ signOut: true });
  const [pending, startTransition] = useTransition();

  function signOut() {
    guard(() =>
      startTransition(async () => {
        // Success redirects to sign-in, which callAction lets through.
        const res = await callAction(async () => {
          await signOutPortal();
          return { ok: true, data: undefined };
        });
        if (!res.ok) toast({ message: res.error });
      }),
    );
  }

  return (
    <MenuTrigger>
      <AriaButton
        aria-label={`Account, ${name}`}
        className="-mr-1.5 flex h-11 w-11 items-center justify-center rounded-md data-pressed:opacity-80"
      >
        <Avatar name={name} email={email} size={32} outline />
      </AriaButton>
      <Menu aria-label="Account">
        <MenuHeader title={name} detail={email !== name ? email : undefined} />
        <MenuSeparator />
        <MenuItem icon={<LogOut aria-hidden="true" />} isDisabled={pending} onAction={signOut}>
          Sign out
        </MenuItem>
      </Menu>
    </MenuTrigger>
  );
}
