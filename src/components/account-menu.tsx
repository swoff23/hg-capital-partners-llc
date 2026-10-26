"use client";
import { useTransition } from "react";
import { LogOut } from "lucide-react";
import { Button as AriaButton } from "react-aria-components";
import { Avatar } from "@/components/avatar";
import { useLeaveGuard } from "@/components/leave-guard";
import { Menu, MenuHeader, MenuItem, MenuSection, MenuSeparator, MenuTrigger } from "@/components/menu";
import { SegmentedControl } from "@/components/segmented-control";
import { THEME_PREFS, useThemePref, type ThemePref } from "@/components/theme-toggle";
import { useToast } from "@/components/toast";
import { callAction } from "@/lib/action-result";
import { cn } from "@/lib/utils";

/**
 * The signed-in person's menu (docs/specs/selectors.md 3.5): their name over
 * their email, the Theme (System, Light or Dark, with a Check on the pick)
 * and Sign out. Settings isn't here; the sidebar's already opens it.
 *
 * `variant="header"` is the avatar button at the right of the app bar (from
 * lg); `"sidebar"` is the row at the foot of the rail and the phone drawer,
 * the avatar with the name and email beside it, which opens the menu upward.
 * The drawer has its own Appearance row, and the header's menu carries the
 * Theme from lg, so the sidebar's menu leaves the section out
 * (`showTheme={false}`).
 *
 * Sign out goes through `useLeaveGuard({ signOut: true })`, which asks first
 * wherever a LeaveGuard sits above the menu and a hold is on. Neither the app
 * shell nor the portal layout mounts one yet, so for now it never asks; the
 * upload chunk (UP1, F2) mounts them. `signOutAction` is the server action
 * that ends the session and redirects to sign-in.
 */
export function AccountMenu({
  name,
  email,
  signOutAction,
  variant = "header",
  showTheme = variant === "header",
}: {
  /** The person's name, or null when they have none and the email stands in for it. */
  name: string | null;
  email: string;
  signOutAction: () => Promise<void> | void;
  variant?: "header" | "sidebar";
  showTheme?: boolean;
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

  const sidebar = variant === "sidebar";
  return (
    <MenuTrigger>
      <AriaButton
        aria-label={`Account, ${label}`}
        className={cn(
          "rounded-md outline-none transition-colors data-focus-visible:outline-solid data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-act",
          sidebar
            ? // 10px in, so the 28px avatar centers on the rail's icons; the words truncate and the collapsed rail clips them.
              "flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-fill-1 data-pressed:bg-fill-1 pointer-coarse:min-h-11"
            : "flex size-8 shrink-0 items-center justify-center hover:bg-fill-1 data-pressed:bg-fill-1 pointer-coarse:size-11",
        )}
      >
        <Avatar name={name} email={email} size={28} />
        {sidebar && (
          <span className="min-w-0 flex-1 overflow-hidden whitespace-nowrap">
            <span className="block truncate text-meta font-medium text-fg-1">{label}</span>
            {name && <span className="block truncate text-meta text-fg-3">{email}</span>}
          </span>
        )}
      </AriaButton>
      <Menu placement={sidebar ? "top start" : "bottom end"} aria-label="Account">
        <MenuHeader title={label} detail={name ? email : undefined} />
        {showTheme && (
          <>
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
          </>
        )}
        <MenuSeparator />
        <MenuItem id="sign-out" icon={<LogOut aria-hidden="true" />} isDisabled={pending} onAction={signOut}>
          Sign out
        </MenuItem>
      </Menu>
    </MenuTrigger>
  );
}

/**
 * The phone drawer's Appearance: System, Light and Dark as a full-width
 * segmented control (the same three the account menu's Theme section offers).
 * Shown below lg, where the header's menu isn't.
 */
export function AppearanceRow({ className }: { className?: string }) {
  const [pref, setPref] = useThemePref();
  return (
    <div className={cn("px-2 py-1.5", className)}>
      <SegmentedControl<ThemePref>
        aria-label="Appearance"
        fullWidth
        options={THEME_PREFS}
        value={pref}
        onChange={setPref}
      />
    </div>
  );
}
