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
