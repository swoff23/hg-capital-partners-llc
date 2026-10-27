import test from "node:test";
import assert from "node:assert/strict";
import { openOnArrow, type TriggerKeyEvent } from "./picker-keys";

/** A key on a closed trigger, as React Aria hands it to a Button's onKeyDown. */
function press(key: string, over: Partial<TriggerKeyEvent> = {}) {
  const seen = { prevented: false, continued: false };
  const e: TriggerKeyEvent = {
    key,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    isDefaultPrevented: () => seen.prevented,
    preventDefault: () => {
      seen.prevented = true;
    },
    continuePropagation: () => {
      seen.continued = true;
    },
    ...over,
  };
  let opened = false;
  openOnArrow(() => {
    opened = true;
  })(e);
  return { opened, ...seen };
}

test("Down and Up open a closed trigger and stop there", () => {
  assert.deepEqual(press("ArrowDown"), { opened: true, prevented: true, continued: false });
  assert.deepEqual(press("ArrowUp"), { opened: true, prevented: true, continued: false });
});

test("Esc on a picker's trigger goes on to the sheet around it, so New task's Due date chip asks to discard", () => {
  assert.deepEqual(press("Escape"), { opened: false, prevented: false, continued: true });
  // ⌘↵ reaches the form's submit too, and an arrow with a modifier is the page's.
  assert.deepEqual(press("Enter", { metaKey: true }), { opened: false, prevented: false, continued: true });
  assert.deepEqual(press("ArrowDown", { altKey: true }), { opened: false, prevented: false, continued: true });
  assert.deepEqual(press("Tab"), { opened: false, prevented: false, continued: true });
});

test("a key the trigger already handled stays where it was", () => {
  assert.deepEqual(press("Escape", { isDefaultPrevented: () => true }), { opened: false, prevented: false, continued: false });
  // A plain DOM event has no continuePropagation: nothing to call, and nothing breaks.
  assert.doesNotThrow(() => press("Escape", { continuePropagation: undefined }));
});
