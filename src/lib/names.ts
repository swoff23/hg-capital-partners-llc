/**
 * The name to greet someone by: "Zack" from "Zack Reading" or "Zack (Outlaw
 * Carpentry)", and the nickname from "Jacob (Jake) Hoak", the name he goes
 * by. Only a one-word parenthetical straight after the first name counts as
 * a nickname; anything else in parentheses is a company. Empty for no name.
 */
export function firstName(name: string | null | undefined): string {
  const s = (name ?? "").trim();
  const nickname = /^[^\s(]+\s*\(\s*([^\s()]+)\s*\)\s+\S/.exec(s);
  if (nickname) return nickname[1];
  return s.split(/[\s(]+/)[0] ?? "";
}

/**
 * A household in a short line, for a toast or a checkbox where the room is
 * short: "Dana Lee", "Dana Lee and Sam Ortiz", "Dana Lee and 2 others".
 * Names are trimmed and a blank one left out.
 */
export function shortNames(names: readonly string[]): string {
  const n = names.map((s) => s.trim()).filter(Boolean);
  if (n.length <= 2) return n.join(" and ");
  return `${n[0]} and ${n.length - 1} others`;
}
