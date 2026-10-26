import { nameExtension } from "./content-types";

/**
 * Names for Download all (docs/specs/uploads-photos.md 2.5): the ZIP's own
 * name ("56 Tamarack St Fix porch light.zip") and a unique, safe name for each
 * file inside it. Pure; see zip.test.ts. The route that streams the archive is
 * src/app/api/files/zip/[kind]/[id]/route.ts.
 */

/** Characters no common file system keeps in a name, and control characters. */
const UNSAFE = /[\\/:*?"<>|\u0000-\u001f\u007f]+/g;

/** A name with the characters a file system refuses taken out, single-spaced and trimmed. */
function clean(name: string): string {
  // Leading dots go too (".." and hidden names), even after a separator was turned into a space.
  return name.replace(UNSAFE, " ").replace(/\s+/g, " ").replace(/^[.\s]+/, "").trim();
}

/**
 * The archive's name: "<address> <title>.zip", or whichever of the two there
 * is, or "Task files.zip". At most 120 characters before the extension.
 */
export function zipFileName(parts: { address?: string | null; title?: string | null }): string {
  const base = clean([parts.address, parts.title].filter(Boolean).join(" ")).slice(0, 120).trim();
  return `${base || "Task files"}.zip`;
}

/**
 * Names for the files inside, in order, each unique without regard to case
 * (a second "Lease.pdf" is "Lease 2.pdf", as the stored names number a second
 * photo of one minute). A name that cleans to nothing is "file".
 */
export function zipEntryNames(names: readonly string[]): string[] {
  const used = new Set<string>();
  return names.map((raw) => {
    const name = clean(raw).slice(0, 200) || "file";
    const ext = nameExtension(name);
    const stem = ext ? name.slice(0, -(ext.length + 1)) : name;
    let candidate = name;
    for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = `${stem} ${n}${ext ? `.${ext}` : ""}`;
    used.add(candidate.toLowerCase());
    return candidate;
  });
}
