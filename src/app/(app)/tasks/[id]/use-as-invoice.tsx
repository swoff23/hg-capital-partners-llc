"use client";
import { createContext, useCallback, useContext, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ReceiptText } from "lucide-react";
import type { LightboxMenuItem } from "@/components/lightbox";
import { useToast } from "@/components/toast";
import { callAction } from "@/lib/action-result";
import { makeInvoiceFromFile } from "./invoice-actions";

/** Off on a draft from Claude, as New invoice is in the ⋯ (header.tsx): a draft's files make no invoice (files.ts). */
const UseAsInvoiceOn = createContext(true);

/** Set by the task page (view.tsx) around its photos, files and activity: `on` is false while the task is a draft. */
export function UseAsInvoiceProvider({ on, children }: { on: boolean; children: ReactNode }) {
  return <UseAsInvoiceOn.Provider value={on}>{children}</UseAsInvoiceOn.Provider>;
}

/**
 * "Use as invoice" for a job's file menus (docs/contractor-invoices-plan.md 4.4): `FilesList`'s `menuItems` for a
 * document and `MediaGrid`'s for a photo. Never for a video or a link. A tap makes a To review invoice with the
 * file and this job on it and opens it; a second tap while the first is working does nothing, so one file never
 * makes two invoices.
 */
export function useUseAsInvoice() {
  const router = useRouter();
  const { toast, dismiss } = useToast();
  const busy = useRef(false);
  const on = useContext(UseAsInvoiceOn);

  const start = useCallback(
    async (attachmentId: string) => {
      if (busy.current) return;
      busy.current = true;
      // The copy can take a few seconds on a big PDF; this says so, and the next toast takes its place.
      const working = toast({ message: "Making the invoice…", key: "invoice:from-file" });
      const res = await callAction(() => makeInvoiceFromFile(attachmentId));
      if (!res.ok) {
        busy.current = false;
        toast({ message: res.error, key: "invoice:from-file" });
        return;
      }
      dismiss(working);
      router.push(`/invoices/${res.data.id}`);
      // Held a beat past the push, so a slow navigation can't take a second tap.
      setTimeout(() => (busy.current = false), 1500);
    },
    [router, toast, dismiss],
  );

  const item = useCallback(
    (id: string): readonly LightboxMenuItem[] => [
      { id: "use-as-invoice", label: "Use as invoice", icon: <ReceiptText />, onAction: () => void start(id) },
    ],
    [start],
  );

  return {
    /** A photo's or document's viewer ⋯ (never a video). */
    forMedia: (it: { id: string; kind: "IMAGE" | "VIDEO" | "FILE" }) => (!on || it.kind === "VIDEO" ? [] : item(it.id)),
    /** A document's row ⋯ and viewer ⋯ in FilesList. */
    forFile: (f: { id: string }) => (on ? item(f.id) : []),
  };
}
