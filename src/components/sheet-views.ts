/**
 * The Sheet's view stack, kept pure for its test (sheet.tsx renders it). A
 * view is a picker or a step pushed over the sheet's own body: it takes the
 * title, the body and, when it has one, the footer, with a back arrow beside
 * the X (forms 2.9, selectors 3.5). Never a sheet on a sheet.
 */
export type SheetViewEscape = "back" | "close";

export type SheetViewEntry = {
  id: string;
  title: string;
  /**
   * What Esc does while this view is on top. "back": a picker pushed over a
   * form goes back to the form. "close": a step that answers one pick (a
   * status follow-up, Custom repeat, the phone calendar) closes the whole
   * layer with nothing changed (build plan conflict 8).
   */
  escape: SheetViewEscape;
  hasFooter: boolean;
};

/** Adds a view on top; a view already in the stack stays where it is. */
export function pushView<T extends SheetViewEntry>(stack: readonly T[], view: T): T[] {
  return stack.some((v) => v.id === view.id) ? [...stack] : [...stack, view];
}

/** Takes a view out, wherever it is (the picker that pushed it closed). */
export function removeView<T extends SheetViewEntry>(stack: readonly T[], id: string): T[] {
  return stack.filter((v) => v.id !== id);
}

/** A view's title, Esc or footer changed while it shows. */
export function updateView<T extends SheetViewEntry>(
  stack: readonly T[],
  id: string,
  patch: Partial<Pick<SheetViewEntry, "title" | "escape" | "hasFooter">>,
): T[] {
  return stack.map((v) => (v.id === id ? { ...v, ...patch } : v));
}

/**
 * What one Esc does: back one view, or close the layer, or (when the sheet is
 * dirty and its owner asks first) "ask". One Esc, one layer: a "back" view
 * only goes back, never closes.
 */
export function sheetEscape(top: SheetViewEntry | undefined, asksBeforeClosing: boolean): "back" | "close" | "ask" {
  if (top?.escape === "back") return "back";
  return asksBeforeClosing ? "ask" : "close";
}

/** What one Esc does to a stack of views: take the top `count` views off (their owners unmount them), close the whole sheet, or ask first. */
export type EscapePlan = { kind: "pop"; count: number } | { kind: "close" } | { kind: "ask" };

/**
 * One Esc, one layer. A "back" view (a picker over a form) goes back one view.
 * A "close" view (a step that answers one pick: a status follow-up, Custom
 * repeat, the phone calendar) closes the layer it belongs to: if a picker's
 * own view sits under it, both leave and the form shows again; with none, the
 * step is the sheet's own layer and the sheet closes (asking first when dirty).
 */
export function escapePlan<T extends SheetViewEntry>(stack: readonly T[], asksBeforeClosing: boolean): EscapePlan {
  const top = stack.at(-1);
  if (top?.escape === "back") return { kind: "pop", count: 1 };
  if (top) {
    for (let i = stack.length - 2; i >= 0; i--) {
      if (stack[i].escape === "back") return { kind: "pop", count: stack.length - i };
    }
  }
  return asksBeforeClosing ? { kind: "ask" } : { kind: "close" };
}
