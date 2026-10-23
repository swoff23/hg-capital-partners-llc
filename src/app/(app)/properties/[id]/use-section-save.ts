"use client";
import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/action-result";

/**
 * Save handler for a property section editor (details, loan, insurance, notes).
 * Closes the editor on success; when the save is refused, keeps it open with
 * what was typed and the reason. It runs on submit rather than as the form's
 * `action`, because React resets a form's inputs after its action runs.
 */
export function useSectionSave(save: (fd: FormData) => Promise<ActionResult>, onSaved: () => void) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    start(async () => {
      const r = await save(fd);
      if (r.ok) onSaved();
      else setError(r.error);
    });
  }

  return { pending, error, onSubmit, clearError: () => setError(null) };
}
