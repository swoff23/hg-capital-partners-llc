/**
 * The keys a closed picker trigger answers (selectors 2, Keyboard), apart
 * from React so it's tested without a DOM (picker-keys.test.ts). The event is
 * React's, or React Aria's wrapper of it, which adds `continuePropagation`.
 */
export interface TriggerKeyEvent {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  isDefaultPrevented(): boolean;
  preventDefault(): void;
  /** React Aria's: let the key go on to the trigger's ancestors. */
  continuePropagation?: () => void;
}

/**
 * A closed trigger opens on Down or Up, as well as Enter and Space. Spread it
 * on a button that opens a layer without a `trigger` (a field's calendar
 * button); `PickerLayer` adds it to its own trigger. Every other key goes on
 * to the trigger's ancestors: React Aria stops each key a Button's onKeyDown
 * sees unless told to go on, so without this Esc on a date chip in New task
 * never reached the sheet (one Esc closes one layer), and ⌘↵ never reached
 * the form. A key something else already handled stays where it was.
 */
export function openOnArrow(open: () => void) {
  return (e: TriggerKeyEvent) => {
    if (e.isDefaultPrevented()) return;
    if (e.metaKey || e.ctrlKey || e.altKey || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) {
      e.continuePropagation?.();
      return;
    }
    e.preventDefault();
    open();
  };
}
