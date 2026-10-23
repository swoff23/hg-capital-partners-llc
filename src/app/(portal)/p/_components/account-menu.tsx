"use client";
import { useTransition } from "react";
import { LogOut } from "lucide-react";
import { Button as AriaButton } from "react-aria-components";
import { Avatar } from "@/components/avatar";
import { Menu, MenuItem, MenuTrigger } from "@/components/menu";
import { useToast } from "@/components/toast";
import { callAction } from "@/lib/action-result";
import { signOutPortal } from "../actions";

/** The contractor's initials, opening a menu with Sign out. */
export function AccountMenu({ name, email }: { name: string; email: string }) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  function signOut() {
    startTransition(async () => {
      // Success redirects to sign-in, which callAction lets through.
      const res = await callAction(async () => {
        await signOutPortal();
        return { ok: true, data: undefined };
      });
      if (!res.ok) toast({ message: res.error });
    });
  }

  return (
    <MenuTrigger>
      <AriaButton
        aria-label={`Account, ${name}`}
        className="-mr-1.5 flex h-11 w-11 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary/30 data-pressed:opacity-80"
      >
        <Avatar name={name} email={email} size={32} outline />
      </AriaButton>
      <Menu>
        <MenuItem icon={<LogOut aria-hidden="true" />} isDisabled={pending} onAction={signOut}>
          Sign out
        </MenuItem>
      </Menu>
    </MenuTrigger>
  );
}
