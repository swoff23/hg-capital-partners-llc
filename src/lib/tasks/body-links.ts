/**
 * Links in a comment's body (docs/specs/activity-comments.md 2.2 a): a comment
 * renders as text with links and nothing else, no formatting, and never the
 * HTML an Asana import kept (`data.html`). Pure; see body-links.test.ts.
 *
 *  - `https://` addresses open in a new tab. Only https is linked, so a
 *    `javascript:` or `http:` string stays text.
 *  - `/tasks/<id>` links to the task, labelled with its title when the page
 *    knows it, otherwise "a task".
 *  - An Asana task link points at an imported task when the import has it,
 *    and reads "Asana task (not imported)" as plain text when it doesn't.
 *  - An Asana profile link becomes the person's name when the import matched
 *    them, and is dropped when it didn't.
 *
 * The contractor's job page passes `mode: "portal"`: it links https addresses
 * only. A `/tasks/<id>` path stays as typed and an Asana task link reads "an
 * Asana task", with no lookup of titles, so a comment never shows another
 * job's name or a link a contractor can't open; Asana profiles are dropped,
 * which would show other contractors' names.
 */

export type BodySegment =
  | { type: "text"; text: string }
  | { type: "link"; href: string; text: string }
  | { type: "task"; href: string; text: string };

export interface BodyLinkContext {
  /** "staff" (default) links tasks and names people; "portal" links https addresses only. */
  mode?: "staff" | "portal";
  /** HG task ids to titles, for the tasks the page knows. */
  taskTitles?: Readonly<Record<string, string>>;
  /** Asana task gids to the HG task id of the imported task. */
  asanaTasks?: Readonly<Record<string, string>>;
  /** Asana user gids to the name the import matched. */
  asanaPeople?: Readonly<Record<string, string>>;
}

// https://app.asana.com/0/<project>/<task>[/f], .../0/0/<task>, and the newer
// https://app.asana.com/1/<workspace>/project/<project>/task/<task>[?...]
const ASANA_TASK = /^https:\/\/app\.asana\.com\/(?:0\/\d+\/(\d+)(?:\/f)?|1\/\d+\/(?:project\/\d+\/)?task\/(\d+))/;
// https://app.asana.com/0/profile/<gid> and https://app.asana.com/1/<workspace>/profile/<gid>
const ASANA_PROFILE = /^https:\/\/app\.asana\.com\/(?:0|1\/\d+)\/profile\/(\d+)/;

// An https address, or a /tasks/<id> path not glued to a word or a longer path.
const TOKEN = /https:\/\/[^\s<>"]+|(?<![\w/.-])\/tasks\/([A-Za-z0-9_-]{8,})(?![\w/-])/g;

/** An address without the punctuation that ends the sentence around it. */
function trimUrl(url: string): { url: string; rest: string } {
  let end = url.length;
  while (end > 0 && /[.,;:!?)\]'"”’]/.test(url[end - 1])) {
    // A closing bracket belongs to the address when it opened one inside it.
    if (url[end - 1] === ")" && url.slice(0, end - 1).split("(").length > url.slice(0, end - 1).split(")").length) break;
    end--;
  }
  return { url: url.slice(0, end), rest: url.slice(end) };
}

/** The Asana task gids a body links to, so the page can find the ones that were imported. */
export function asanaTaskGids(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(TOKEN)) {
    const hit = m[0].startsWith("https://") ? ASANA_TASK.exec(trimUrl(m[0]).url) : null;
    const gid = hit?.[1] ?? hit?.[2];
    if (gid) out.add(gid);
  }
  return [...out];
}

/** The Asana user gids a body links to, so the page can find the people the import matched. */
export function asanaProfileGids(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(TOKEN)) {
    const hit = m[0].startsWith("https://") ? ASANA_PROFILE.exec(trimUrl(m[0]).url) : null;
    if (hit?.[1]) out.add(hit[1]);
  }
  return [...out];
}

/** The HG task ids a body links to by path, so the page can look their titles up. */
export function taskIdsIn(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(TOKEN)) if (m[1]) out.add(m[1]);
  return [...out];
}

/** A body as segments of text and links, in order. Adjacent text is joined. */
export function bodySegments(text: string, ctx: BodyLinkContext = {}): BodySegment[] {
  const portal = ctx.mode === "portal";
  const out: BodySegment[] = [];
  const push = (seg: BodySegment) => {
    const last = out[out.length - 1];
    if (seg.type === "text" && last?.type === "text") last.text += seg.text;
    else if (seg.text !== "") out.push(seg);
  };

  let at = 0;
  for (const m of text.matchAll(TOKEN)) {
    const start = m.index!;
    push({ type: "text", text: text.slice(at, start) });
    at = start + m[0].length;

    if (m[1]) {
      // A /tasks/<id> path.
      if (portal) push({ type: "text", text: m[0] });
      else push({ type: "task", href: `/tasks/${m[1]}`, text: ctx.taskTitles?.[m[1]] ?? "a task" });
      continue;
    }

    const { url, rest } = trimUrl(m[0]);
    at -= rest.length;
    const profile = ASANA_PROFILE.exec(url);
    const task = ASANA_TASK.exec(url);
    if (profile) {
      // The person's name when the import matched them; otherwise the address goes. Never in the portal.
      const name = portal ? undefined : ctx.asanaPeople?.[profile[1]];
      if (name) push({ type: "text", text: name });
    } else if (task) {
      const hg = portal ? undefined : ctx.asanaTasks?.[task[1] ?? task[2]];
      if (hg) push({ type: "task", href: `/tasks/${hg}`, text: ctx.taskTitles?.[hg] ?? "a task" });
      else push({ type: "text", text: portal ? "an Asana task" : "Asana task (not imported)" });
    } else if (url.length > "https://".length) {
      push({ type: "link", href: url, text: url });
    } else {
      push({ type: "text", text: url });
    }
  }
  push({ type: "text", text: text.slice(at) });
  return out;
}
