"use client";
import { useSyncExternalStore } from "react";

/** The key printed for the platform's command modifier: "⌘" on Apple devices, "Ctrl" everywhere else. */
export type ModKey = "⌘" | "Ctrl";

/** "⌘" for a Mac, iPhone or iPad platform string, "Ctrl" for anything else (Windows, Linux, Android, ChromeOS). */
export function modKeyFor(platform: string): ModKey {
  return /mac|iphone|ipad|ipod/i.test(platform) ? "⌘" : "Ctrl";
}

/**
 * A shortcut as printed in a Kbd: "⌘K" and "⌘↵" on a Mac, "Ctrl K" and
 * "Ctrl ↵" elsewhere (search 2.1).
 */
export function shortcutLabel(mod: ModKey, key: string): string {
  return mod === "⌘" ? `⌘${key}` : `Ctrl ${key}`;
}

function platformString(): string {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  return nav.userAgentData?.platform || nav.platform || nav.userAgent || "";
}

const noSubscribe = () => () => {};

/**
 * The command modifier to print in shortcuts on this device, "⌘" or "Ctrl"
 * (the platform Kbd helper). The server and hydration render "⌘", then a
 * non-Apple device switches to "Ctrl". Kbd hides on touch, so a phone never
 * shows either.
 */
export function useModKey(): ModKey {
  return useSyncExternalStore(
    noSubscribe,
    () => modKeyFor(platformString()),
    () => "⌘",
  );
}
