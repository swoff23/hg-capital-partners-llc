/**
 * How long a toast's message can be and still fit one line on a phone. A
 * toast (components/toast.tsx) wraps rather than cuts off (Connor, Nov 22),
 * but one line reads best: at 320, the narrowest screen, it has about 218px of
 * text beside the × (16px Geist on touch), which is about 30 characters; at
 * 375 it is about 33. A refusal or conflict line that carries the next step
 * keeps to this, so the step reads at a glance. Tests hold the lines to it (archive.test.ts, save-conflict.test.ts,
 * lazy-module.test.ts).
 */
export const TOAST_PHONE_CHARS = 30;
