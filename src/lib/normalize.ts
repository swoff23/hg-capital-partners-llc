export function normalizeAddress(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .toString()
    .toLowerCase()
    .replace(/\n/g, " ")
    .replace(/\bavenue\b/g, "ave")
    .replace(/\bstreet\b/g, "st")
    .replace(/\bdrive\b/g, "dr")
    .replace(/\broad\b/g, "rd")
    .replace(/[.,#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function shortAddress(a: string | null | undefined): string {
  if (!a) return "";
  return a.split(",")[0].replace(/\s+(buffalo|ny|new york)\b.*/i, "").trim();
}
