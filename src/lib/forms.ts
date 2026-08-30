/** FormData → object with empty strings dropped (so zod `.optional()` works). */
export function formToObject(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    const s = typeof v === "string" ? v.trim() : "";
    if (s !== "") out[k] = s;
  }
  return out;
}
