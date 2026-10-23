/**
 * What an in-place heading edit (components/inline-address-field.tsx) saves
 * on blur or Enter. Runs of whitespace, newlines included, become one space
 * and the ends are trimmed. Null means save nothing and show the stored
 * value again: the text wasn't touched, it says the same once tidied, or
 * it's shorter than `minLength`. A stored value with stray spaces ("256
 * Auburn Avenue   Buffalo") is left alone until someone really edits it.
 * Pure; see inline-edit.test.ts.
 */

const tidy = (s: string) => s.replace(/\s+/g, " ").trim();

export function inlineEditCommit(draft: string, saved: string, minLength = 1): string | null {
  if (draft === saved) return null;
  const next = tidy(draft);
  if (next.length < minLength || next === tidy(saved)) return null;
  return next;
}
