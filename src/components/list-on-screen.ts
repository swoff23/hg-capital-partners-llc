/**
 * Whether a combobox's list is open and drawn. A combobox that takes free
 * text (`allowsCustomValue`) lets its Esc through after closing the list, so
 * whatever sits around it (a sheet, a heading's field) asks this to leave
 * that Esc alone: one Esc closes one layer. The address field keeps an empty
 * list open but out of sight under 3 characters, which is no layer to close.
 */
export function listOnScreen(input: HTMLElement): boolean {
  if (input.getAttribute("role") !== "combobox" || input.getAttribute("aria-expanded") !== "true") return false;
  const id = input.getAttribute("aria-controls");
  const list = id ? document.getElementById(id) : null;
  return !!list && list.getClientRects().length > 0;
}
