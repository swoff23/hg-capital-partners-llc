"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { type ActionResult, callAction } from "@/lib/action-result";
import { changedFields } from "@/lib/properties/edits";
import { patchProperty } from "../actions";

/** A server action that saves the fields an editor changed, each with the value it loaded. */
export type SaveFields = (id: string, changes: Record<string, string>, expected: Record<string, string>) => Promise<ActionResult>;

/** A problem the browser can see before sending: the field it's in, and what to enter. */
export type FieldProblem = { field: string; message: string };

export interface SectionSaveOptions {
  /** Where the changes go: the property's patch by default; the contractor page's Contact passes its own. */
  save?: SaveFields;
  /** Checks the changes before they're sent. A problem keeps the form open, marks its field and focuses it. */
  check?: (changes: Record<string, string>) => FieldProblem | null;
  /** After a save went through and the form closed. */
  onSaved?: () => void;
}

/** The form's text values by field name. */
function formValues(form: HTMLFormElement): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [k, v] of new FormData(form).entries()) if (typeof v === "string") values[k] = v;
  return values;
}

/**
 * Edit session for a section editor (the property's details, loan, insurance
 * and notes; a contractor's Contact). `open` keeps the values the section
 * shows right then (`loaded`), and the form renders from those, so a page
 * refresh mid-edit (a save in another card) neither resets what's typed nor
 * changes what counts as loaded. Save sends only the fields that differ from
 * what was loaded, each with its loaded value, and the service refuses a
 * field someone else changed meanwhile (G2B-003). Closes on success; when the
 * save is refused or the connection drops, keeps the form open with what was
 * typed and the reason. It runs on submit rather than as the form's
 * `action`, because React resets a form's inputs after its action runs.
 *
 * `open("lender")` also puts the caret in that field, for an empty fact's
 * verb ("Add lender"); the form takes `formRef`. When the form closes
 * (Cancel, Save, a discard), focus goes back to the section's Edit, so a
 * keyboard isn't dropped at the top of the page. `invalid` names the field
 * `check` refused, for its `aria-invalid` and the error line under it; a
 * refusal from the server belongs to no field. The form's `onInput` re-checks
 * that field as it's typed in and clears the mark once it reads (forms spec
 * 2.0). `isDirty()` reads the form right then, for a Cancel that asks before
 * it drops typed changes.
 */
export function useSectionSave<T extends Record<string, unknown>>(id: string, current: T, options: SectionSaveOptions = {}) {
  const { save = patchProperty, check, onSaved } = options;
  const [loaded, setLoaded] = useState<T | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const focusName = useRef<string | null>(null);
  const returnTo = useRef<Element | null>(null);

  useEffect(() => {
    if (loaded) {
      // Once the form is up, focus the field the verb named.
      const name = focusName.current;
      if (!name) return;
      focusName.current = null;
      const el = formRef.current?.elements.namedItem(name);
      if (el instanceof HTMLElement) el.focus();
      return;
    }
    // Once the view is back, focus its Edit (SectionCard marks it).
    const section = returnTo.current;
    returnTo.current = null;
    if (section?.isConnected) section.querySelector<HTMLElement>("[data-section-edit]")?.focus();
  }, [loaded]);

  /** Closes the form; focus goes to the section's Edit once the view renders. */
  function finish() {
    returnTo.current = formRef.current?.closest("section") ?? null;
    setLoaded(null);
  }

  function open(field?: string) {
    // Passed straight to onClick, it gets the click event: only a name counts.
    focusName.current = typeof field === "string" ? field : null;
    setError(null);
    setInvalid(null);
    setLoaded(current);
  }

  function close() {
    setError(null);
    setInvalid(null);
    finish();
  }

  function isDirty(): boolean {
    const form = formRef.current;
    if (!loaded || !form) return false;
    return Object.keys(changedFields(loaded, formValues(form)).changes).length > 0;
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!loaded) return;
    const form = e.currentTarget;
    const { changes, expected } = changedFields(loaded, formValues(form));
    if (Object.keys(changes).length === 0) return close();
    const problem = check?.(changes) ?? null;
    if (problem) {
      setError(problem.message);
      setInvalid(problem.field);
      const el = form.elements.namedItem(problem.field);
      if (el instanceof HTMLElement) el.focus();
      return;
    }
    setError(null);
    setInvalid(null);
    start(async () => {
      const r = await callAction(() => save(id, changes, expected));
      if (r.ok) {
        finish();
        onSaved?.();
      } else setError(r.error);
    });
  }

  /** The form's onInput: typing in the field `check` refused re-checks it, and a value that reads clears the mark. */
  function onInput(e: React.FormEvent<HTMLFormElement>) {
    const el = e.target;
    if (!invalid || !check) return;
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) return;
    if (el.name !== invalid) return;
    const problem = check({ [el.name]: el.value });
    if (!problem) {
      setError(null);
      setInvalid(null);
    } else if (problem.message !== error) setError(problem.message);
  }

  return { loaded, open, close, pending, error, invalid, onSubmit, onInput, formRef, isDirty };
}
