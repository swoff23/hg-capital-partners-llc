"use client";
import { useState, useTransition } from "react";
import { callAction, type ActionConflict, type ActionResult, type FieldErrors } from "@/lib/action-result";
import { useToast } from "@/components/toast";

export type RunOptions<T = unknown> = {
  before?: () => void;
  /** After a failure: put back what the user typed. */
  failed?: () => void;
  /** After a success, with what the action returned: a create's `{ id }`, so a sheet can close or open the record. */
  succeeded?: (data: T) => void;
  done?: string;
  /** The ripple clause after `done`, in the toast's second tone: "Unit cleared". */
  detail?: string;
  /** What the toast is about ("task:abc:due"): a quick second edit replaces the toast instead of stacking another. */
  key?: string;
  undo?: () => Promise<ActionResult<unknown>>;
  /**
   * Where a failure shows. "toast" (the default) toasts its one line, as the
   * task page's chips do. "inline" doesn't: the caller shows `error`,
   * `fieldErrors` and `conflict` in place, on the field or above the primary
   * (forms 2.0 and 2.12).
   */
  failure?: "toast" | "inline";
};

export type UseRun = {
  run: <T>(action: () => Promise<ActionResult<T>>, opts?: RunOptions<T>) => void;
  /** True while an action runs, Undo's save included. */
  pending: boolean;
  toast: ReturnType<typeof useToast>["toast"];
  /**
   * The last run's failure, for a form that shows it in place (forms 2.12):
   * its one line, each field's line from a zod failure, and a save conflict
   * (who, when, their values). Cleared when the next run starts, and by
   * `reset`. Undefined after a success.
   */
  error?: string;
  fieldErrors?: FieldErrors;
  conflict?: ActionConflict;
  /** Drops the shown failure: the person edited the field it was about, or closed the form. */
  reset: () => void;
};

type Failure = { error: string; fieldErrors?: FieldErrors; conflict?: ActionConflict };

/**
 * Run a record's action in a transition. A refusal, or a call that never got
 * through, shows as a toast (or, with `failure: "inline"`, only in the
 * returned `error`, `fieldErrors` and `conflict`); `done` adds a
 * confirmation, with Undo when `undo` is given. Optimistic values set inside
 * `before` last until the page refreshes. Pickers, rails and form sheets
 * share it.
 */
export function useRun(): UseRun {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [failure, setFailure] = useState<Failure | null>(null);

  function run<T>(action: () => Promise<ActionResult<T>>, opts: RunOptions<T> = {}) {
    setFailure(null);
    start(async () => {
      opts.before?.();
      const res = await callAction(action);
      if (!res.ok) {
        setFailure({
          error: res.error,
          ...(res.fieldErrors ? { fieldErrors: res.fieldErrors } : {}),
          ...(res.conflict ? { conflict: res.conflict } : {}),
        });
        if (opts.failure !== "inline") toast({ message: res.error });
        opts.failed?.();
        return;
      }
      opts.succeeded?.(res.data);
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
                  // In the same transition as the change, so whatever waits on `pending` (the status menu,
                  // Approve, Cancel) waits for Undo to save too.
                  onAction: () =>
                    start(async () => {
                      const r = await callAction(undo);
                      if (!r.ok) toast({ message: r.error });
                    }),
                },
              }
            : {}),
        });
      }
    });
  }

  return {
    run,
    pending,
    toast,
    error: failure?.error,
    fieldErrors: failure?.fieldErrors,
    conflict: failure?.conflict,
    reset: () => setFailure(null),
  };
}
