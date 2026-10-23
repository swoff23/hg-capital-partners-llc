"use client";
import { useRef } from "react";

/**
 * Keys for a field that saves on blur: Enter saves, Esc cancels. Esc resets the
 * value and blurs, but the blur handler still sees the typed text until the
 * next render, so it used to save exactly what the person was throwing away.
 * The returned onBlur skips the save once after Esc.
 *
 *   const keys = useInlineEditKeys(() => setV(value), commit);
 *   <input onBlur={keys.onBlur} onKeyDown={keys.onKeyDown} ... />
 */
export function useInlineEditKeys(onCancel: () => void, onSave: () => void) {
  const cancelled = useRef(false);
  return {
    onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
      if (e.key === "Enter") e.currentTarget.blur();
      if (e.key === "Escape") {
        cancelled.current = true;
        onCancel();
        e.currentTarget.blur();
      }
    },
    onBlur() {
      if (cancelled.current) {
        cancelled.current = false;
        return;
      }
      onSave();
    },
  };
}
