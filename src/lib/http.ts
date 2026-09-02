/**
 * Small HTTP header helpers. Pure; see http.test.ts.
 */

/**
 * `Content-Disposition` for serving a stored file under its original name.
 * ASCII-safe fallback in `filename=`, the real name RFC 5987-encoded in
 * `filename*=` so "Léase 2026.pdf" survives every browser.
 */
export function contentDisposition(filename: string, type: "inline" | "attachment" = "inline"): string {
  const safe = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_").trim() || "file";
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${type}; filename="${safe}"; filename*=UTF-8''${encoded}`;
}
