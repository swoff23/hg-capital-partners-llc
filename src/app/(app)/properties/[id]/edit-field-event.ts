/**
 * A verb outside a record section that opens that section's editor on one
 * field: the fact strip's "Add value" opens Details with the caret in Value.
 * The section listens (onPropertyFieldRequest) and calls its own `open(field)`,
 * so focus lands in the field and the page scrolls to it.
 */
const EVENT = "property:edit-field";

export function openPropertyField(field: string) {
  window.dispatchEvent(new CustomEvent<string>(EVENT, { detail: field }));
}

/** Subscribes `open` to requests for any of `fields`; returns the unsubscribe. */
export function onPropertyFieldRequest(fields: readonly string[], open: (field: string) => void): () => void {
  const listener = (e: Event) => {
    const field = (e as CustomEvent<string>).detail;
    if (fields.includes(field)) open(field);
  };
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

const REVEAL_EVENT = "property:reveal-field";

/**
 * Shows a field's row without opening its editor: a search hit on the loan
 * number lands on it (docs/specs/search-deeper-fields.md 5), and a row folded
 * behind "N more fields" has to be out first.
 */
export function revealPropertyField(field: string) {
  window.dispatchEvent(new CustomEvent<string>(REVEAL_EVENT, { detail: field }));
}

/** Subscribes `reveal` to show requests for any of `fields`; returns the unsubscribe. */
export function onPropertyFieldReveal(fields: readonly string[], reveal: (field: string) => void): () => void {
  const listener = (e: Event) => {
    const field = (e as CustomEvent<string>).detail;
    if (fields.includes(field)) reveal(field);
  };
  window.addEventListener(REVEAL_EVENT, listener);
  return () => window.removeEventListener(REVEAL_EVENT, listener);
}

const UNIT_EVENT = "property:edit-unit";

/** Opens one unit's sheet from outside the Units section: Missing info's rows on the property page (docs/specs/missing-info.md). */
export function openPropertyUnit(unitId: string) {
  window.dispatchEvent(new CustomEvent<string>(UNIT_EVENT, { detail: unitId }));
}

/** Subscribes `open` to requests for a unit's sheet; returns the unsubscribe. */
export function onPropertyUnitRequest(open: (unitId: string) => void): () => void {
  const listener = (e: Event) => open((e as CustomEvent<string>).detail);
  window.addEventListener(UNIT_EVENT, listener);
  return () => window.removeEventListener(UNIT_EVENT, listener);
}
