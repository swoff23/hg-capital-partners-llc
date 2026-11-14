import test from "node:test";
import assert from "node:assert/strict";
import {
  findOldNames,
  OLD_CLASS,
  OLD_VAR,
  RENAMED,
  renameClass,
  renameClassesInText,
  renameText,
  renameVarsInText,
} from "../../scripts/token-renames.mjs";

/* The Nov 14 color rename (docs/specs/design-foundation.md, sections 3.1,
   3.4, 6.2 and 7.2). These strings hold the old names on purpose, so the
   rename script and token-names.test.ts skip this file. */

test("the map is the 11 renamed tokens plus the 5 derived ones", () => {
  assert.deepEqual(RENAMED, {
    "fg-1": "foreground",
    "fg-3": "muted-foreground",
    surface: "background",
    raised: "popover",
    "fill-1": "muted",
    "fill-2": "accent",
    act: "primary",
    "on-act": "primary-foreground",
    danger: "destructive",
    line: "border",
    "line-control": "input",
    "act-hover": "primary-hover",
    "danger-tint": "destructive-tint",
    "danger-fill": "destructive-fill",
    "danger-fill-hover": "destructive-fill-hover",
    "on-danger": "destructive-foreground",
  });
  assert.ok(OLD_CLASS.global && OLD_VAR.global, "both patterns are global, for replace and matchAll");
});

test("never touches the look-alikes the spec lists", () => {
  const untouched = [
    'data-surface="public"',
    '[data-surface="public"] .x',
    "line-clamp-2",
    "underline underline-offset-2",
    "line-through",
    "select-none",
    'variant="danger"',
    'tone="danger"',
    'import { toast } from "@/lib/toast-line";',
    'import { SourceLine } from "@/components/source-line";',
    "whitespace-pre-line",
    "// eslint-disable-next-line hg/design-tokens",
    "<canvas ref={ref} />",
    "input, select, textarea { font-size: 16px; }",
  ];
  for (const text of untouched) {
    assert.equal(renameText(text), text, text);
    assert.deepEqual(findOldNames(text), [], text);
  }
});

test("leaves kept tokens, new names and plain words alone", () => {
  const untouched = [
    "text-fg-2 bg-canvas border-line-strong border-line-float bg-select",
    "bg-toast-bg text-toast-fg border-toast-edge bg-pill-bg text-on-photo bg-photo-scrim",
    "text-warn bg-warn-tint text-ok bg-ok-tint text-gold bg-ink-tile border-tile-edge",
    "var(--fg-2) var(--line-strong) var(--line-float) var(--canvas) var(--chart-1) var(--chart-ref)",
    "--color-line-strong: var(--line-strong);",
    "text-foreground text-muted-foreground bg-background bg-popover bg-muted bg-accent",
    "bg-primary text-primary-foreground ring-ring outline-ring border-border border-input text-destructive",
    "const { surface, line, fill1, fg3, act, onAct } = brandTokens; t.line; input.line;",
    "line: string; danger: boolean; act(); surface",
    "fg-3 fill-1 on-act",
    "bg-fg-30 text-fg-1x text-fg-10",
    "my-text-fg-3 x_text-fg-3",
  ];
  for (const text of untouched) assert.equal(renameText(text), text, text);
});

test("renames each token, including the derived family", () => {
  const cases: Array<[string, string]> = [
    ["text-fg-1", "text-foreground"],
    ["text-fg-3", "text-muted-foreground"],
    ["bg-surface", "bg-background"],
    ["bg-raised", "bg-popover"],
    ["bg-fill-1", "bg-muted"],
    ["bg-fill-2", "bg-accent"],
    ["bg-act", "bg-primary"],
    ["text-on-act", "text-primary-foreground"],
    ["text-danger", "text-destructive"],
    ["border-line", "border-border"],
    ["border-line-control", "border-input"],
    ["hover:bg-act-hover", "hover:bg-primary-hover"],
    ["bg-danger-tint", "bg-destructive-tint"],
    ["bg-danger-fill", "bg-destructive-fill"],
    ["hover:bg-danger-fill-hover", "hover:bg-destructive-fill-hover"],
    ["text-on-danger", "text-destructive-foreground"],
  ];
  for (const [from, to] of cases) {
    assert.equal(renameClass(from), to, from);
    assert.equal(renameClassesInText(`"${from}"`), `"${to}"`, from);
  }
});

test("renames every color utility prefix", () => {
  const cases: Array<[string, string]> = [
    ["divide-line", "divide-border"],
    ["border-t-line", "border-t-border"],
    ["border-x-line", "border-x-border"],
    ["border-s-line", "border-s-border"],
    ["border-bs-line", "border-bs-border"],
    ["border-be-line", "border-be-border"],
    ["ring-line-control", "ring-input"],
    ["ring-offset-surface", "ring-offset-background"],
    ["inset-ring-line", "inset-ring-border"],
    ["fill-fill-1", "fill-muted"],
    ["stroke-surface", "stroke-background"],
    ["decoration-fg-3", "decoration-muted-foreground"],
    ["caret-fg-1", "caret-foreground"],
    ["accent-act", "accent-primary"],
    ["placeholder-fg-3", "placeholder-muted-foreground"],
    ["shadow-line", "shadow-border"],
    ["inset-shadow-line", "inset-shadow-border"],
    ["drop-shadow-line", "drop-shadow-border"],
    ["text-shadow-line", "text-shadow-border"],
    ["from-surface via-fill-1 to-fill-2", "from-background via-muted to-accent"],
    ["text-act", "text-primary"],
    ["fill-act stroke-act", "fill-primary stroke-primary"],
  ];
  for (const [from, to] of cases) assert.equal(renameClassesInText(from), to, from);
});

test("border-line, line-control and line-strong stay apart", () => {
  assert.equal(
    renameText("border-line border-line-strong border-line-control border-line-float divide-line-strong"),
    "border-border border-line-strong border-input border-line-float divide-line-strong",
  );
  assert.equal(renameText("--line --line-strong --line-control --line-float"), "--border --line-strong --input --line-float");
  assert.equal(renameText("bg-danger bg-danger-tint bg-danger-fill bg-danger-fill-hover"), "bg-destructive bg-destructive-tint bg-destructive-fill bg-destructive-fill-hover");
  assert.equal(renameText("bg-act bg-act-hover text-on-act"), "bg-primary bg-primary-hover text-primary-foreground");
});

test("keeps opacity suffixes and the important mark", () => {
  const cases: Array<[string, string]> = [
    ["text-on-act/70", "text-primary-foreground/70"],
    ["bg-fill-1/80", "bg-muted/80"],
    ["bg-danger/10", "bg-destructive/10"],
    ["ring-act/30", "ring-primary/30"],
    ["focus-visible:ring-act/50", "focus-visible:ring-ring/50"],
    ["border-line/60", "border-border/60"],
    ["bg-surface/[0.92]", "bg-background/[0.92]"],
    ["text-fg-3!", "text-muted-foreground!"],
    ["!text-fg-3", "!text-muted-foreground"],
  ];
  for (const [from, to] of cases) {
    assert.equal(renameClass(from), to, from);
    assert.equal(renameClassesInText(from), to, from);
  }
});

test("keeps variant chains in front of the utility", () => {
  const cases: Array<[string, string]> = [
    ["hover:bg-fill-1", "hover:bg-muted"],
    ["group-hover/row:text-fg-3", "group-hover/row:text-muted-foreground"],
    ["[&_svg]:text-fg-3", "[&_svg]:text-muted-foreground"],
    ["[&>svg]:text-fg-3", "[&>svg]:text-muted-foreground"],
    ["data-[state=open]:bg-fill-2", "data-[state=open]:bg-accent"],
    ["aria-[current=page]:border-act", "aria-[current=page]:border-primary"],
    ["dark:hover:bg-fill-2", "dark:hover:bg-accent"],
    ["pointer-fine:group-hover/row:text-fg-1", "pointer-fine:group-hover/row:text-foreground"],
    ["not-disabled:hover:bg-danger-fill-hover", "not-disabled:hover:bg-destructive-fill-hover"],
    ["group-data-scrolled/grid:shadow-[inset_-1px_0_0_var(--line)]", "group-data-scrolled/grid:shadow-[inset_-1px_0_0_var(--border)]"],
    ["*:text-fg-3", "*:text-muted-foreground"],
    ["@md:text-fg-1", "@md:text-foreground"],
    ["before:bg-act", "before:bg-primary"],
    ["data-pending:before:bg-act", "data-pending:before:bg-primary"],
  ];
  for (const [from, to] of cases) {
    assert.equal(renameClass(from), to, from);
    assert.equal(renameText(`cn("p-2 ${from} rounded-md")`), `cn("p-2 ${to} rounded-md")`, from);
  }
  // The class pass leaves a variable inside an arbitrary value to the variable pass.
  assert.equal(renameClassesInText("shadow-[inset_-1px_0_0_var(--line)]"), "shadow-[inset_-1px_0_0_var(--line)]");
});

test("act: focus rings become ring, everything else primary", () => {
  const cases: Array<[string, string]> = [
    // Every outline-act draws focus.
    ["outline-act", "outline-ring"],
    ["focus-visible:outline-act", "focus-visible:outline-ring"],
    ["data-focus-visible:outline-act", "data-focus-visible:outline-ring"],
    ["group-focus-visible/check:outline-act", "group-focus-visible/check:outline-ring"],
    // ring-act and border-act under a focus variant.
    ["focus:ring-act", "focus:ring-ring"],
    ["focus-visible:ring-act", "focus-visible:ring-ring"],
    ["focus-within:ring-act", "focus-within:ring-ring"],
    ["data-focus-visible:ring-act", "data-focus-visible:ring-ring"],
    ["group-focus-visible:ring-act", "group-focus-visible:ring-ring"],
    ["focus:border-act", "focus:border-ring"],
    ["focus-visible:border-act", "focus-visible:border-ring"],
    ["focus-within:border-act", "focus-within:border-ring"],
    ["data-focus-visible:border-act", "data-focus-visible:border-ring"],
    ["dark:focus-visible:ring-act", "dark:focus-visible:ring-ring"],
    ["focus-visible:hover:ring-act", "focus-visible:hover:ring-ring"],
    ["group-data-focus-visible:ring-act", "group-data-focus-visible:ring-ring"],
    ["peer-focus:ring-act", "peer-focus:ring-ring"],
    ["has-[:focus-visible]:ring-act", "has-[:focus-visible]:ring-ring"],
    // Fills, edges and states: primary.
    ["bg-act", "bg-primary"],
    ["ring-act", "ring-primary"],
    ["border-act", "border-primary"],
    ["data-pressed:ring-act", "data-pressed:ring-primary"],
    ["data-pressed:border-act", "data-pressed:border-primary"],
    ["checked:border-act", "checked:border-primary"],
    ["group-data-selected:border-act", "group-data-selected:border-primary"],
    ["data-pending:border-act", "data-pending:border-primary"],
    ["not-focus:ring-act", "not-focus:ring-primary"],
    ["focus-visible:bg-act", "focus-visible:bg-primary"],
    ["focus-visible:ring-offset-act", "focus-visible:ring-offset-primary"],
    ["focus-visible:text-act", "focus-visible:text-primary"],
  ];
  for (const [from, to] of cases) {
    assert.equal(renameClass(from), to, from);
    assert.equal(renameClassesInText(`className="${from}"`), `className="${to}"`, from);
  }
});

test("act: each class in a string reads its own chain", () => {
  assert.equal(
    renameClassesInText('"border-act focus-visible:border-act ring-act focus:ring-act outline-act bg-act"'),
    '"border-primary focus-visible:border-ring ring-primary focus:ring-ring outline-ring bg-primary"',
  );
  assert.equal(
    renameClassesInText("cn(on ? \"focus-visible:ring-act\" : \"ring-act\", `${a}focus:border-act ${b}border-act`)"),
    "cn(on ? \"focus-visible:ring-ring\" : \"ring-primary\", `${a}focus:border-ring ${b}border-primary`)",
  );
  // A focus variant on the class before doesn't carry over.
  assert.equal(renameClassesInText("focus-visible:ring-2 ring-act"), "focus-visible:ring-2 ring-primary");
  assert.equal(renameClassesInText("`focus-visible:outline-act` and `ring-act`"), "`focus-visible:outline-ring` and `ring-primary`");
});

test("renames escaped forms", () => {
  // As CSS writes the selectors.
  const css = [
    [".hover\\:bg-fill-1:hover", ".hover\\:bg-muted:hover"],
    [".text-on-act\\/70", ".text-primary-foreground\\/70"],
    [".\\[\\&_svg\\]\\:text-fg-3 svg", ".\\[\\&_svg\\]\\:text-muted-foreground svg"],
    [".focus-visible\\:outline-act:focus-visible", ".focus-visible\\:outline-ring:focus-visible"],
    [".focus\\:ring-act:focus", ".focus\\:ring-ring:focus"],
    [".data-pressed\\:border-act[data-pressed]", ".data-pressed\\:border-primary[data-pressed]"],
    [".group-focus-visible\\/check\\:outline-act", ".group-focus-visible\\/check\\:outline-ring"],
    [".a.focus\\:border-act, .b .ring-act", ".a.focus\\:border-ring, .b .ring-primary"],
    [".border-line-strong, .border-line", ".border-line-strong, .border-border"],
  ];
  for (const [from, to] of css) assert.equal(renameClassesInText(from), to, from);
  // As a JS string holds them, with the backslash doubled.
  assert.equal(renameClassesInText('".focus-visible\\\\:ring-act"'), '".focus-visible\\\\:ring-ring"');
  assert.equal(renameClassesInText('".hover\\\\:bg-fill-1"'), '".hover\\\\:bg-muted"');
});

test("renames CSS variables, with and without the color- prefix", () => {
  const cases: Array<[string, string]> = [
    ["color: var(--fg-3);", "color: var(--muted-foreground);"],
    ["--color-fg-3: var(--fg-3);", "--color-muted-foreground: var(--muted-foreground);"],
    ["--color-line-control: var(--line-control);", "--color-input: var(--input);"],
    ["--line-float: var(--line);", "--line-float: var(--border);"],
    ["--tile-edge: var(--line);", "--tile-edge: var(--border);"],
    ["--surface: #ffffff;", "--background: #ffffff;"],
    ["--danger-fill-hover: #a31818;", "--destructive-fill-hover: #a31818;"],
    ["--on-danger: #ffffff;", "--destructive-foreground: #ffffff;"],
    ["bg-[var(--fill-1)]", "bg-[var(--muted)]"],
    ["bg-(--fill-2)", "bg-(--accent)"],
    ["text-[--fg-3]", "text-[--muted-foreground]"],
    ['style={{ color: "var(--danger)" }}', 'style={{ color: "var(--destructive)" }}'],
    ["`--fg-3` in the docs, and `--color-act`", "`--muted-foreground` in the docs, and `--color-primary`"],
    ["| `--line` | `#e7e5e0` | `#212835` |", "| `--border` | `#e7e5e0` | `#212835` |"],
    ["the 8px --act unread dot", "the 8px --primary unread dot"],
  ];
  for (const [from, to] of cases) {
    assert.equal(renameVarsInText(from), to, from);
    assert.equal(renameText(from), to, from);
  }
  // A variable has no focus context: --act is always --primary, and :focus-visible moves to --ring by hand.
  assert.equal(renameVarsInText(":focus-visible { outline: 2px solid var(--act); }"), ":focus-visible { outline: 2px solid var(--primary); }");
  assert.equal(renameVarsInText("--act-hover: #28364d;"), "--primary-hover: #28364d;");
  // Not a variable: no leading --, or a longer name.
  assert.equal(renameVarsInText("fg-3 ---fg-3 --fg-30 --line-strong x--line"), "fg-3 ---fg-3 --fg-30 --line-strong x--line");
});

test("renameClass takes one candidate and leaves anything else as it was", () => {
  assert.equal(renameClass("p-4"), "p-4");
  assert.equal(renameClass("text-fg-2"), "text-fg-2");
  assert.equal(renameClass("border-line-strong"), "border-line-strong");
  assert.equal(renameClass("hover:bg-canvas"), "hover:bg-canvas");
  assert.equal(renameClass("[&:is(.a,.b)]:focus-visible:ring-act"), "[&:is(.a,.b)]:focus-visible:ring-ring");
  assert.equal(renameClass("[&:is(.a,.b)]:ring-act"), "[&:is(.a,.b)]:ring-primary");
  assert.equal(renameClass("shadow-[0_0_0_1px_var(--line-control)]"), "shadow-[0_0_0_1px_var(--input)]");
});

test("findOldNames reports each old name with its replacement", () => {
  const text = 'cn("text-fg-3 focus-visible:ring-act", "ring-act") /* var(--line) */ border-line-strong --color-fill-1';
  const hits = findOldNames(text);
  assert.deepEqual(
    hits.map(({ match, replacement, kind }) => ({ match, replacement, kind })),
    [
      { match: "text-fg-3", replacement: "text-muted-foreground", kind: "class" },
      { match: "ring-act", replacement: "ring-ring", kind: "class" },
      { match: "ring-act", replacement: "ring-primary", kind: "class" },
      { match: "--line", replacement: "--border", kind: "var" },
      { match: "--color-fill-1", replacement: "--color-muted", kind: "var" },
    ],
  );
  for (const hit of hits) assert.equal(text.slice(hit.index, hit.index + hit.match.length), hit.match);
  // The global patterns keep no state between calls.
  assert.deepEqual(findOldNames(text), hits);
  assert.deepEqual(findOldNames("nothing old here"), []);
});

test("one pass: renaming twice changes nothing more, and leaves no old name", () => {
  const sample = [
    'className={cn("bg-surface text-fg-1 border-line hover:bg-fill-1 data-focus-visible:outline-act", on && "bg-act text-on-act hover:bg-act-hover")}',
    "--color-danger-fill: var(--danger-fill); --color-fg-3: var(--fg-3); --line-float: var(--line);",
    ".focus-visible\\:ring-act:focus-visible, .text-on-act\\/70 { }",
    "| `--fill-2` | `bg-fill-2` | `text-danger` |",
  ].join("\n");
  const once = renameText(sample);
  assert.equal(renameText(once), once);
  assert.deepEqual(findOldNames(once), []);
  assert.equal(findOldNames(sample).length, 18);
});
