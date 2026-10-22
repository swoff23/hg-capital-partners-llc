export type FindingKind =
  | "page-error"
  | "console-error"
  | "request-failed"
  | "overflow"
  | "ios-input-zoom"
  | "small-tap-target"
  | "wrapped-row";

/** Errors fail the test. Warnings show in the report for a human to judge. */
export const SEVERITY: Record<FindingKind, "error" | "warning"> = {
  "page-error": "error",
  "console-error": "error",
  "request-failed": "error",
  overflow: "error",
  "ios-input-zoom": "error",
  "small-tap-target": "warning",
  "wrapped-row": "warning",
};

export const KIND_LABEL: Record<FindingKind, string> = {
  "page-error": "Page crashed or failed to load",
  "console-error": "Console error",
  "request-failed": "Request failed",
  overflow: "Page scrolls sideways",
  "ios-input-zoom": "Input text under 16px (iOS zooms in on focus)",
  "small-tap-target": "Tap targets under 44px tall",
  "wrapped-row": "Row of controls wrapped onto a second line",
};

export interface Finding {
  kind: FindingKind;
  /** Where on the page, e.g. `header > div.flex > button "Save"` */
  where: string;
  detail: string;
  /** Viewport widths the finding showed up at */
  widths: number[];
  /** Listed in known-issues.json, so it doesn't fail the run */
  known?: boolean;
}

export interface ScanOptions {
  /** Touch device: check tap targets */
  touch: boolean;
  /** iOS: check for inputs that trigger focus zoom */
  ios: boolean;
}

export type ScanResult = Omit<Finding, "widths" | "known">[];

/**
 * Runs inside the page via page.evaluate, so it must stay self-contained:
 * no imports and no references to anything outside this function body.
 */
export function scanPage(opts: ScanOptions): ScanResult {
  const results: ScanResult = [];
  const vw = document.documentElement.clientWidth;
  const all: HTMLElement[] = [document.body, ...Array.from(document.body.querySelectorAll<HTMLElement>("*"))];
  const styles = new Map<Element, CSSStyleDeclaration>();
  const style = (el: Element) => {
    let cs = styles.get(el);
    if (!cs) {
      cs = getComputedStyle(el);
      styles.set(el, cs);
    }
    return cs;
  };
  const isVisible = (el: Element) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const cs = style(el);
    return cs.visibility !== "hidden" && cs.display !== "none";
  };
  const label = (el: Element) => {
    const h = el as HTMLElement & { placeholder?: string; value?: string };
    const text =
      el.getAttribute("aria-label") ||
      (h.innerText || "").trim() ||
      h.placeholder ||
      (typeof h.value === "string" ? h.value : "");
    const short = text.replace(/\s+/g, " ").slice(0, 40);
    return short ? ` "${short}${text.length > 40 ? "…" : ""}"` : "";
  };
  const describe = (el: Element) => {
    const parts: string[] = [];
    let node: Element | null = el;
    for (let i = 0; node && node !== document.documentElement && i < 3; i++) {
      let part = node.tagName.toLowerCase();
      if (node.id) {
        parts.unshift(`${part}#${node.id}`);
        break;
      }
      const classes = Array.from(node.classList)
        .filter((c) => /^[a-zA-Z0-9_-]+$/.test(c))
        .slice(0, 2);
      if (classes.length) part += "." + classes.join(".");
      parts.unshift(part);
      node = node.parentElement;
    }
    return parts.join(" > ") + label(el);
  };

  // 1. Sideways scroll. Report the elements that stick out past their own
  //    container, since those are the ones to fix.
  const overBy = document.documentElement.scrollWidth - vw;
  if (overBy > 1) {
    const escapesFlow = (el: Element) => {
      for (let n: Element | null = el; n && n !== document.documentElement; n = n.parentElement) {
        const cs = style(n);
        if (cs.position === "fixed") return true;
        if (n !== el && cs.overflowX !== "visible") return true;
      }
      return false;
    };
    const offenders = all.filter((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      if (r.right <= vw + 1 && r.left >= -1) return false;
      return !escapesFlow(el);
    });
    const culprits = offenders
      .filter((el) => {
        const parent = el.parentElement;
        if (!parent || parent === document.documentElement) return true;
        const r = el.getBoundingClientRect();
        const p = parent.getBoundingClientRect();
        return r.right > p.right + 1 || r.left < p.left - 1;
      })
      .sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right)
      .slice(0, 3);
    for (const el of culprits.length ? culprits : offenders.slice(0, 1)) {
      const r = el.getBoundingClientRect();
      const past = Math.round(Math.max(r.right - vw, -r.left));
      results.push({ kind: "overflow", where: describe(el), detail: `${past}px past the screen edge` });
    }
    if (!culprits.length && !offenders.length) {
      results.push({ kind: "overflow", where: "page", detail: `${Math.round(overBy)}px wider than the screen` });
    }
  }

  const interactive =
    'a[href], button, input:not([type="hidden"]), select, textarea, summary, ' +
    '[role="button"], [role="tab"], [role="link"], [role="checkbox"], [role="switch"], [role="menuitem"]';

  // 2. iOS Safari zooms the whole page when a field under 16px gets focus.
  if (opts.ios) {
    const fields = document.querySelectorAll<HTMLElement>(
      'input, textarea, select, [contenteditable=""], [contenteditable="true"]',
    );
    const skip = ["checkbox", "radio", "range", "hidden", "submit", "button", "reset", "color", "file", "image"];
    for (const el of Array.from(fields)) {
      if (el instanceof HTMLInputElement && skip.includes(el.type)) continue;
      if (!isVisible(el)) continue;
      const size = parseFloat(style(el).fontSize);
      if (size < 16) results.push({ kind: "ios-input-zoom", where: describe(el), detail: `${size}px text` });
    }
  }

  // 3. Tap targets under 44px tall (Apple HIG). Inline links inside running
  //    text are exempt, as are checkboxes and radios wrapped in a label.
  if (opts.touch) {
    const small: { el: HTMLElement; h: number }[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(interactive))) {
      if (!isVisible(el) || (el as HTMLButtonElement).disabled) continue;
      if (el.parentElement?.closest(interactive)) continue;
      if (el instanceof HTMLInputElement && ["checkbox", "radio"].includes(el.type) && el.closest("label")) continue;
      if (el.tagName === "A" && style(el).display === "inline") continue;
      const h = el.getBoundingClientRect().height;
      if (h < 44) small.push({ el, h });
    }
    if (small.length) {
      small.sort((a, b) => a.h - b.h);
      const examples = small
        .slice(0, 3)
        .map(({ el, h }) => `${describe(el)} (${Math.round(h)}px)`)
        .join("; ");
      results.push({ kind: "small-tap-target", where: `${small.length} on this page`, detail: `Smallest: ${examples}` });
    }
  }

  // 4. Rows of controls that wrapped. Only flex rows allowed to wrap can, and
  //    only rows holding two or more controls count.
  for (const el of all) {
    const cs = style(el);
    if (!cs.display.endsWith("flex") || !cs.flexDirection.startsWith("row") || cs.flexWrap === "nowrap") continue;
    if (!isVisible(el)) continue;
    const kids = Array.from(el.children).filter((c) => {
      const kcs = style(c);
      return isVisible(c) && kcs.position !== "absolute" && kcs.position !== "fixed";
    });
    const controls = kids.filter((c) => c.matches(interactive) || c.querySelector(interactive));
    if (controls.length < 2) continue;
    const rects = kids.map((c) => c.getBoundingClientRect()).sort((a, b) => a.top - b.top);
    let lines = 1;
    let lineBottom = rects[0].bottom;
    for (const r of rects.slice(1)) {
      if (r.top >= lineBottom - 1) {
        lines++;
        lineBottom = r.bottom;
      } else {
        lineBottom = Math.max(lineBottom, r.bottom);
      }
    }
    if (lines > 1) results.push({ kind: "wrapped-row", where: describe(el), detail: `${lines} lines` });
  }

  return results;
}
