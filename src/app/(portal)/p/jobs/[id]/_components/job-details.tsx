"use client";
import { useOptimistic, useTransition } from "react";
import { Copy, KeyRound, Navigation } from "lucide-react";
import { useToast } from "@/components/toast";
import { Button, LinkButton } from "@/components/ui";
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

/** Directions (Apple Maps; other phones get the web map) and Copy address. */
export function AddressActions({ address }: { address: string }) {
  const copy = useCopy();
  return (
    <div className="mt-3 flex items-center gap-2">
      <LinkButton
        href={`https://maps.apple.com/?daddr=${encodeURIComponent(address)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0"
      >
        <Navigation className="h-4 w-4" aria-hidden="true" />
        Directions
      </LinkButton>
      <Button variant="secondary" className="shrink-0" onClick={() => copy(address, "Address copied")}>
        <Copy className="h-4 w-4" aria-hidden="true" />
        Copy address
      </Button>
    </div>
  );
}

/** D21: the lockbox code, large, the whole card copies it. */
export function LockboxCard({ code }: { code: string }) {
  const copy = useCopy();
  // The code sits inside a button, which iOS won't let anyone select, so a failed copy says the code instead.
  return (
    <button
      type="button"
      onClick={() => copy(code, "Lockbox code copied", `Couldn't copy. The code is ${code}.`)}
      aria-label={`Lockbox code ${code}. Copy`}
      className="mt-5 flex w-full items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-left shadow-sm outline-none transition-colors hover:border-zinc-300 focus-visible:ring-2 focus-visible:ring-primary/30 dark:hover:border-zinc-600"
    >
      <KeyRound className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-muted">Lockbox</span>
        <span className="block break-words font-mono text-lg font-semibold tracking-wider">{code}</span>
      </span>
      <Copy className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
    </button>
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
    <section className="mt-7" aria-labelledby="checklist-heading">
      <h2 id="checklist-heading" className="mb-1 text-sm font-semibold">
        Checklist <span className="ml-1 font-normal tabular-nums text-muted">{`${doneCount}/${shown.length}`}</span>
      </h2>
      <ul>
        {shown.map((item) => (
          <li key={item.id}>
            <label className={cn("flex min-h-11 items-center gap-3 py-1", editable ? "cursor-pointer" : "cursor-default")}>
              <input
                type="checkbox"
                checked={item.done}
                disabled={!editable}
                onChange={(e) => toggle(item.id, e.target.checked)}
                className="h-5 w-5 shrink-0 cursor-[inherit] rounded accent-primary disabled:opacity-60"
              />
              <span className={cn("text-sm", item.done && "text-muted line-through")}>{item.title}</span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
