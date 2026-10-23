"use client";
import { useTransition } from "react";
import type { ActionResult } from "@/lib/action-result";
import { useToast } from "@/components/toast";

/**
 * Run one of the task page's actions in a transition. A refusal shows as a
 * toast; `done` adds a confirmation, with Undo when `undo` is given.
 * Optimistic values set inside `before` last until the page refreshes.
 */
export function useRun() {
  const { toast } = useToast();
  const [pending, start] = useTransition();

  function run(
    action: () => Promise<ActionResult<unknown>>,
    opts: { before?: () => void; done?: string; undo?: () => Promise<ActionResult<unknown>> } = {},
  ) {
    start(async () => {
      opts.before?.();
      const res = await action();
      if (!res.ok) {
        toast({ message: res.error });
        return;
      }
      if (opts.done) {
        const undo = opts.undo;
        toast({
          message: opts.done,
          ...(undo
            ? {
                action: {
                  label: "Undo",
                  onAction: () =>
                    void undo().then((r) => {
                      if (!r.ok) toast({ message: r.error });
                    }),
                },
              }
            : {}),
        });
      }
    });
  }

  return { run, pending, toast };
}
