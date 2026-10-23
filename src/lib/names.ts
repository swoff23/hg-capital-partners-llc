/** "Zack" from "Zack Reading" or "Zack (Outlaw Carpentry)". Empty for no name. */
export function firstName(name: string | null | undefined): string {
  return (name ?? "").trim().split(/[\s(]+/)[0] ?? "";
}
