"use client";
import { useTransition } from "react";
import { callAction, type ActionConflict, type ActionResult, type FieldErrors } from "@/lib/action-result";
import { useToast } from "@/components/toast";

export type RunOptions = {
  before?: () => void;
  /** After a failure's toast: put back what the user typed. */
  failed?: () => void;
  done?: string;
  /** The ripple clause after `done`, in the toast's second tone: "Unit cleared". */
  detail?: string;
  /** What the toast is about ("task:abc:due"): a quick second edit replaces the toast instead of stacking another. */
  key?: string;
  undo?: () => Promise<ActionResult<unknown>>;
};

export type UseRun = {
  run: (action: () => Promise<ActionResult<unknown>>, opts?: RunOptions) => void;
  /** True while an action runs. */
  pending: boolean;
  toast: ReturnType<typeof useToast>["toast"];
  /**
   * The last failure's line, its per-field messages and a save conflict, for
   * a form that shows them in place instead of a toast (forms 2.12). The save
   * pipeline fills them when it lands; until then they stay undefined and a
   * failure shows as today's toast.
   */
  error?: string;
  fieldErrors?: FieldErrors;
  conflict?: ActionConflict;
};

/**
 * Run a record's action in a transition. A refusal, or a call that never got
 * through, shows as a toast; `done` adds a confirmation, with Undo when
 * `undo` is given. Optimistic values set inside `before` last until the page
 * refreshes. Moved here from the task page so pickers and rails share it.
 */
export function useRun(): UseRun {
  const { toast } = useToast();
  const [pending, start] = useTransition();

  function run(action: () => Promise<ActionResult<unknown>>, opts: RunOptions = {}) {
    start(async () => {
      opts.before?.();
      const res = await callAction(action);
      if (!res.ok) {
        toast({ message: res.error });
        opts.failed?.();
        return;
      }
      if (opts.done) {
        const undo = opts.undo;
        toast({
          message: opts.done,
          ...(opts.detail ? { detail: opts.detail } : {}),
          ...(opts.key ? { key: opts.key } : {}),
          ...(undo
            ? {
                action: {
                  label: "Undo",
                  onAction: () =>
                    void callAction(undo).then((r) => {
                      if (!r.ok) toast({ message: r.error });
                    }),
                },
              }
            : {}),
        });
      }
    });
  }

  return { run, pending, toast, error: undefined, fieldErrors: undefined, conflict: undefined };
}
