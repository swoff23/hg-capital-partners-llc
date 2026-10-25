"use client";
import { useOptimistic, useTransition } from "react";
import { Copy, Navigation } from "lucide-react";
import { Code } from "@/components/code";
import { useToast } from "@/components/toast";
import { Button, Checkbox, LinkButton, Section } from "@/components/ui";
import { callAction } from "@/lib/action-result";
import { cn } from "@/lib/utils";
import { setChecklistItemAction } from "../actions";

/** Writes to the clipboard and says so in a toast; says what to do when the browser refuses. */
function useCopy() {
  const { toast } = useToast();
  return async (text: string, done: string, failed = "Couldn't copy. Select the text to copy it instead.") => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ message: done });
    } catch {
      toast({ message: failed });
    }
  };
}

/**
 * Directions (Apple Maps; other phones get the web map) and Copy address.
 * On a phone the two share the row, so at 320 neither runs into the gutter;
 * below 360 Copy address shortens to Copy, its name staying whole.
 */
export function AddressActions({ address }: { address: string }) {
  const copy = useCopy();
  return (
    <div className="mt-3 flex items-center gap-2">
      <LinkButton
        href={`https://maps.apple.com/?daddr=${encodeURIComponent(address)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="min-w-0 flex-1 whitespace-nowrap sm:flex-none"
      >
        <Navigation className="h-4 w-4" aria-hidden="true" />
        Directions
      </LinkButton>
      <Button
        variant="secondary"
        aria-label="Copy address"
        className="min-w-0 flex-1 whitespace-nowrap sm:flex-none"
        onClick={() => copy(address, "Address copied")}
      >
        <Copy className="h-4 w-4" aria-hidden="true" />
        {/* Tailwind's max-[360px] is width < 360, so the pair meets at 360 without both showing. */}
        <span className="max-[360px]:hidden">Copy address</span>
        <span className="min-[360px]:hidden">Copy</span>
      </Button>
    </div>
  );
}

/**
 * D21: the lockbox code, large, through Code: a tap on the code or on Copy
 * copies it. A failed copy from Copy says the code, as the old card did.
 * Code's button names the code for screen readers. A long code scrolls in
 * its own box rather than the page.
 */
export function LockboxSection({ code }: { code: string }) {
  const copy = useCopy();
  return (
    <Section title="Lockbox">
      {/* Copy sits at the row's end on a phone, beside the code on a wider screen.
          overflow-x-auto alone would make the box scroll up and down too, by the
          part of Code's touch hit area past py-1; 36 + 8 keeps that area at 44. */}
      <div className="flex items-center justify-between gap-3 sm:justify-start sm:gap-4">
        <div className="-mx-1 min-w-0 overflow-x-auto overflow-y-hidden px-1 py-1">
          {/* Its own Copy button sits beside it, so the code drops the hover copy icon. */}
          <Code value={code} label="Lockbox code" size="lg" copyIcon={false} />
        </div>
        <Button
          variant="secondary"
          className="shrink-0"
          onClick={() => copy(code, "Lockbox code copied", `Couldn't copy. The code is ${code}.`)}
        >
          <Copy className="h-4 w-4" aria-hidden="true" />
          Copy
        </Button>
      </div>
    </Section>
  );
}

type Item = { id: string; title: string; done: boolean };

/** Tickable while the job is active; read-only once it's closed. */
export function JobChecklist({ items, editable }: { items: Item[]; editable: boolean }) {
  const { toast } = useToast();
  const [, startTransition] = useTransition();
  const [shown, setShown] = useOptimistic(items, (state, next: { id: string; done: boolean }) =>
    state.map((i) => (i.id === next.id ? { ...i, done: next.done } : i)),
  );
  const doneCount = shown.filter((i) => i.done).length;

  const toggle = (id: string, done: boolean) =>
    startTransition(async () => {
      setShown({ id, done });
      // On a failure the tick goes back by itself: the optimistic value only lasts as long as the transition.
      const res = await callAction(() => setChecklistItemAction(id, done));
      if (!res.ok) toast({ message: res.error });
    });

  return (
    <Section
      title={
        <>
          Checklist <span className="ml-1 font-normal tabular-nums text-fg-3">{`${doneCount}/${shown.length}`}</span>
        </>
      }
    >
      {/* The 44px rows already pad each line, so the list starts a little higher. */}
      <ul className="-mt-2">
        {shown.map((item) => (
          <li key={item.id}>
            <label className={cn("flex min-h-11 items-center gap-3 py-1", editable ? "cursor-pointer" : "cursor-default")}>
              {/* Drawn from the tokens, so the box is the same in every engine and in dark. */}
              <Checkbox large checked={item.done} disabled={!editable} onChange={(e) => toggle(item.id, e.target.checked)} />
              <span className={cn("text-body", item.done ? "text-fg-3 line-through" : "text-fg-1")}>{item.title}</span>
            </label>
          </li>
        ))}
      </ul>
    </Section>
  );
}
