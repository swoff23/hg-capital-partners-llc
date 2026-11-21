/**
 * Where keyboard focus goes when draft rows leave the Tasks list after an Add
 * or a Discard: the pressed button leaves with its row, and with nowhere to go
 * the browser starts over from the top of the page. Browser only; the rows are
 * found by the link each one carries (task-row.tsx) inside `[data-draft-rows]`
 * (draft-sections.tsx).
 */

const idOf = (a: HTMLAnchorElement) => (a.getAttribute("href") ?? "").replace(/^\/tasks\//, "").split("#")[0];

/**
 * The element to focus once `leaving` rows are gone: the next draft row's
 * link, else the one before it, else the list's first row, else the page's
 * heading. Null with nothing to go to.
 */
export function focusTargetAfter(leaving: ReadonlySet<string>): HTMLElement | null {
  const root = document.querySelector("[data-draft-rows]");
  const links = [...(root?.querySelectorAll<HTMLAnchorElement>("li a[href^='/tasks/']") ?? [])];
  const first = links.findIndex((a) => leaving.has(idOf(a)));
  if (first >= 0) {
    const staying = links.filter((a, i) => !leaving.has(idOf(a)) && i !== first);
    const after = staying.find((a) => links.indexOf(a) > first);
    const next = after ?? staying[staying.length - 1];
    if (next) return next;
  }
  const row = [...document.querySelectorAll<HTMLAnchorElement>("main li a[href^='/tasks/']")].find((a) => !root?.contains(a));
  if (row) return row;
  const heading = document.querySelector<HTMLElement>("main h1");
  if (heading && !heading.hasAttribute("tabindex")) heading.tabIndex = -1;
  return heading;
}

/**
 * Moves focus to `focusTargetAfter(leaving)` before the rows go, but only
 * when focus is inside one of them (a click or tap that left focus elsewhere
 * has nothing to rescue). Returns where it put focus, or null.
 */
export function keepFocusBeyond(leaving: ReadonlySet<string>): HTMLElement | null {
  const active = document.activeElement;
  const root = document.querySelector("[data-draft-rows]");
  if (!(active instanceof HTMLElement) || !root?.contains(active) || active === root) return null;
  const target = focusTargetAfter(leaving);
  target?.focus({ preventScroll: true });
  return target;
}

/** The control an Add or Add all was pressed on: a row's button by its row and name, a section button by its words. */
export interface PressedControl {
  rowId: string | null;
  label: string;
  /**
   * Where `keepFocusBeyond` put focus when the rows left. With no other draft row that is an ordinary task row or
   * the heading, outside the draft rows; focus still sitting there is ours to take back, not the person moving on.
   */
  movedTo?: HTMLElement | null;
}

/** What had focus inside the draft rows, to give it back if the press is refused. Null when focus was elsewhere. */
export function pressedControl(): PressedControl | null {
  const active = document.activeElement;
  const root = document.querySelector("[data-draft-rows]");
  if (!(active instanceof HTMLElement) || !root?.contains(active) || active === root) return null;
  const label = active.getAttribute("aria-label") ?? active.textContent?.trim() ?? "";
  const link = active.closest("li")?.querySelector<HTMLAnchorElement>("a[href^='/tasks/']");
  return label ? { rowId: link ? idOf(link) : null, label } : null;
}

/**
 * Focuses the control again once its row is drawn, when focus is still on the page body, on a draft row, or where
 * `keepFocusBeyond` moved it. False while the control is not there yet; true, doing nothing, when the person has
 * moved on.
 */
export function focusPressed(p: PressedControl): boolean {
  const root = document.querySelector("[data-draft-rows]");
  if (!root) return false;
  const active = document.activeElement;
  if (active && active !== document.body && !root.contains(active) && active !== p.movedTo) return true;
  const scope = p.rowId === null ? root : [...root.querySelectorAll<HTMLAnchorElement>("li a[href^='/tasks/']")].find((a) => idOf(a) === p.rowId)?.closest("li");
  if (!scope) return false;
  const button = [...scope.querySelectorAll<HTMLElement>("button")].find(
    (b) => (b.getAttribute("aria-label") ?? b.textContent?.trim()) === p.label && (p.rowId !== null || !b.closest("li")),
  );
  if (!button) return false;
  button.focus({ preventScroll: true });
  return true;
}

/** On a draft's page after Add: the title, since the banner that held focus is gone. */
export function focusPageTitle(): void {
  requestAnimationFrame(() => document.querySelector<HTMLElement>("h1 [data-inline-value]")?.focus({ preventScroll: true }));
}
