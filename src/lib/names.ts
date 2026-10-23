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
