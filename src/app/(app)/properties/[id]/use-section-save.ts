"use client";
import { useState, useTransition } from "react";
import { callAction } from "@/lib/action-result";
import { changedFields } from "@/lib/properties/edits";
import { patchProperty } from "../actions";

/**
 * Edit session for a property section editor (details, loan, insurance, notes).
 * `open` keeps the values the section shows right then (`loaded`), and the form
 * renders from those, so a page refresh mid-edit (a save in another card)
 * neither resets what's typed nor changes what counts as loaded. Save sends
 * only the fields that differ from what was loaded, each with its loaded
 * value, and the service refuses a field someone else changed meanwhile
 * (G2B-003). Closes on success; when the save is refused or the connection
 * drops, keeps the form open with what was typed and the reason. It runs on
 * submit rather than as the form's `action`, because React resets a form's
 * inputs after its action runs.
 */
export function useSectionSave<T extends Record<string, unknown>>(id: string, current: T) {
  const [loaded, setLoaded] = useState<T | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function open() {
    setError(null);
    setLoaded(current);
  }

  function close() {
    setError(null);
    setLoaded(null);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!loaded) return;
    const submitted: Record<string, string> = {};
    for (const [k, v] of new FormData(e.currentTarget).entries()) if (typeof v === "string") submitted[k] = v;
    const { changes, expected } = changedFields(loaded, submitted);
    if (Object.keys(changes).length === 0) return close();
    setError(null);
    start(async () => {
      const r = await callAction(() => patchProperty(id, changes, expected));
      if (r.ok) setLoaded(null);
      else setError(r.error);
    });
  }

  return { loaded, open, close, pending, error, onSubmit };
}
