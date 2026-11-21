/**
 * Whether a form's primary should take focus back once its save settles
 * (form-sheet.tsx). A busy primary is disabled, and a browser drops focus
 * from a disabled button to the page itself, where Esc and Tab no longer
 * reach the open sheet: after a refused save, Esc did nothing until a click
 * put focus back inside. Only then: the sheet still open, the save no longer
 * running, and nothing else holding focus (a refusal's first invalid field
 * takes it on its own). Pure; see focus.test.ts.
 */
export function returnFocusAfterSave(s: {
  /** The save was running at the last render. */
  was: boolean;
  pending: boolean;
  isOpen: boolean;
  active: Element | null;
  body: Element | null;
}): boolean {
  if (!s.was || s.pending || !s.isOpen) return false;
  return s.active === null || s.active === s.body;
}

/**
 * Moves focus to the first field a check marked invalid (`aria-invalid`) and
 * scrolls it to the middle of the view, so a refusal is seen where it is, not
 * at the top of the form (forms 2.0). Does nothing when no field is marked.
 */
export function focusFirstInvalid(root: ParentNode | null): void {
  const bad = root?.querySelector<HTMLElement>('[aria-invalid="true"]');
  if (!bad) return;
  bad.focus({ preventScroll: true });
  bad.scrollIntoView({ block: "center", behavior: "auto" });
}
