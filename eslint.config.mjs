import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import { findOldNames } from "./scripts/token-renames.mjs";

// No em dashes in copy (docs/copy-rules.md, rule 4). Comments are fine, and so
// is a lone "—" standing in for an empty value, which is a glyph, not a sentence.
const EM_DASH_MESSAGE =
  "Em dash in copy. Don't swap it for a period or comma: rewrite the sentence, or ask Connor. See docs/copy-rules.md, rule 4.";

// Messages say what happened and what to do next (docs/copy-rules.md, rule 7),
// so the stock lines that say neither are errors. Filler and hype (rule 5) are
// warnings: "unlock" on a lockbox step or "a note that partners see" can be fine.
const VAGUE_COPY =
  /\b(?:something went wrong|an error occurred|an unexpected error|request failed|operation (?:failed|unsuccessful)|oh no)\b/i;
const FILLER_COPY =
  /\b(?:simply|easily|seamless(?:ly)?|effortless(?:ly)?|note that|this lets you|unlock|supercharge|empower)\b/i;

/** A rule that reports a string, template string or JSX text matching `pattern`, with `message(hit)`. */
function copyRule(description, pattern, message) {
  return {
    meta: { type: "suggestion", docs: { description }, schema: [] },
    create(context) {
      function check(node, text) {
        const hit = text.match(pattern);
        if (hit) context.report({ node, message: message(hit[0]) });
      }
      return {
        Literal(node) {
          if (typeof node.value === "string") check(node, node.value);
        },
        TemplateElement(node) {
          check(node, node.value.raw);
        },
        JSXText(node) {
          check(node, node.value);
        },
      };
    },
  };
}

const vagueCopyRule = copyRule(
  "Error copy says what happened and what to do next.",
  VAGUE_COPY,
  (hit) =>
    `"${hit}" says nothing. Say what happened and what to do next, like "Couldn't save. Try again." See docs/copy-rules.md, rule 7.`,
);

const fillerCopyRule = copyRule(
  "No filler or hype words in copy.",
  FILLER_COPY,
  (hit) => `"${hit}" reads as filler or hype. Cut it, or say the concrete thing. See docs/copy-rules.md, rule 5.`,
);

const HEIC_MESSAGE =
  "heic-to loads only through the dynamic import in src/lib/attachments/heic.ts (heicToJpeg), so it stays out of every page's bundle.";

// Error alerts (docs/specs/error-alerts.md): each Sentry package has one file that may
// import it, so the browser package stays a lazy chunk and the server one stays on the server.
const SENTRY_BROWSER_MESSAGE =
  "@sentry/browser loads only through src/lib/sentry-browser.ts, which src/instrumentation-client.ts imports with import() once the page is idle.";
const SENTRY_SERVER_MESSAGE =
  "@sentry/nextjs is used only in src/lib/report-server.ts (and next.config.ts), so it never reaches a page's bundle. Report through logError (src/lib/log.ts).";

const HEIC_PATHS = [{ name: "heic-to", message: HEIC_MESSAGE, allowTypeImports: true }];
const HEIC_PATTERNS = [{ group: ["heic-to/*"], message: HEIC_MESSAGE, allowTypeImports: true }];
const SENTRY_BROWSER_PATHS = [{ name: "@sentry/browser", message: SENTRY_BROWSER_MESSAGE, allowTypeImports: true }];
const SENTRY_SERVER_PATHS = [{ name: "@sentry/nextjs", message: SENTRY_SERVER_MESSAGE, allowTypeImports: true }];
const SENTRY_PATTERNS = [
  { group: ["@sentry/browser/*"], message: SENTRY_BROWSER_MESSAGE, allowTypeImports: true },
  { group: ["@sentry/nextjs/*", "@sentry/node", "@sentry/node/*", "@sentry/react", "@sentry/react/*", "@sentry/core", "@sentry/core/*"], message: SENTRY_SERVER_MESSAGE, allowTypeImports: true },
];

// Brand values come from the tokens in src/app/globals.css, so a re-brand is a
// token swap (docs/brand-guidelines.md, section 4). A value the tokens can't
// carry (a fixed size the guidelines name) takes an eslint-disable-next-line
// comment saying why.
const PALETTES =
  "amber|blue|cyan|emerald|fuchsia|gray|green|indigo|lime|mauve|mist|neutral|olive|orange|pink|purple|red|rose|sky|slate|stone|taupe|teal|violet|yellow|zinc";
const DESIGN_VALUE_RULES = [
  {
    pattern: /-\[#/,
    message: "Hex color in an arbitrary value. Use a color token from globals.css (text-fg-2, bg-canvas, border-border).",
  },
  {
    pattern: /\btext-\[\d/,
    message: "Arbitrary text size. Use a type token (text-body, text-meta, text-micro) from globals.css.",
  },
  {
    // Every palette in Tailwind's theme.css, each followed by a step.
    pattern: new RegExp(`\\b(?:${PALETTES})-\\d{2,3}\\b`),
    message:
      "Raw palette color. Use a token from globals.css: foreground, muted-foreground, fg-2, muted, accent, border for neutrals; destructive, warn, ok for status.",
  },
  {
    pattern: /\btext-(?:xs|sm|base|lg|[2-9]?xl)\b/,
    message: "Tailwind text size. Use the type token for the role: text-body, text-label, text-meta or text-micro (section 3).",
  },
  {
    // Since Nov 14 these are ground colors, so as text they nearly disappear. Until
    // Oct 25 text-muted meant today's text-muted-foreground.
    pattern: /(?<![\w-])text-(?:muted|accent|background)(?![\w-])/,
    message: "A ground color used as text. Use text-muted-foreground or text-foreground.",
  },
];

/**
 * The message for an old color name, naming the new one (docs/specs/design-foundation.md,
 * section 6.2). `act` split in two, so where it can draw either a fill or a focus
 * ring the message names both.
 */
function oldNameMessage({ match, replacement }) {
  const prefix = /^(--(?:color-)?|ring-|border(?:-(?:[trblxyse]|bs|be))?-)act$/.exec(match)?.[1];
  if (prefix) return `"${match}" is the old name. Use "${prefix}primary", or "${prefix}ring" for a focus ring.`;
  return `"${match}" is the old name. Use "${replacement}".`;
}

/** Reports a string, template string or JSX attribute holding a raw design value or an old color name. */
const designTokensRule = {
  meta: {
    type: "suggestion",
    docs: { description: "Use the design tokens in globals.css instead of raw colors and sizes." },
    schema: [],
  },
  create(context) {
    function check(node, text) {
      for (const { pattern, message } of DESIGN_VALUE_RULES) {
        if (pattern.test(text)) context.report({ node, message });
      }
      // findOldNames loops with matchAll, so its global patterns keep no state between strings.
      for (const hit of findOldNames(text)) context.report({ node, message: oldNameMessage(hit) });
    }
    return {
      Literal(node) {
        if (typeof node.value === "string") check(node, node.value);
      },
      TemplateElement(node) {
        check(node, node.value.raw);
      },
    };
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/**/*.test.ts"],
    plugins: {
      hg: { rules: { "design-tokens": designTokensRule, "vague-copy": vagueCopyRule, "filler-copy": fillerCopyRule } },
    },
    rules: {
      "no-restricted-syntax": [
        "error",
        { selector: "JSXText[value=/—/]:not([value=/^\\s*—\\s*$/])", message: EM_DASH_MESSAGE },
        { selector: "Literal[value=/—/]:not([value='—'])", message: EM_DASH_MESSAGE },
        { selector: "TemplateElement[value.raw=/—/]", message: EM_DASH_MESSAGE },
      ],
      "hg/design-tokens": "error",
      "hg/vague-copy": "error",
      "hg/filler-copy": "warn",
      // The HEIC decoder (libheif, LGPL-3.0, about 3 MB) ships as its own lazy
      // chunk, reached only through the dynamic import in
      // src/lib/attachments/heic.ts. A static import would put it in a page's
      // bundle. Dynamic import() isn't checked by this rule.
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [...HEIC_PATHS, ...SENTRY_BROWSER_PATHS, ...SENTRY_SERVER_PATHS],
          patterns: [...HEIC_PATTERNS, ...SENTRY_PATTERNS],
        },
      ],
    },
  },
  // The one file each Sentry package may be imported from. A flat config's later block
  // replaces the rule's options, so each lists everything except its own package.
  {
    files: ["src/lib/sentry-browser.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        { paths: [...HEIC_PATHS, ...SENTRY_SERVER_PATHS], patterns: [...HEIC_PATTERNS, ...SENTRY_PATTERNS.slice(1)] },
      ],
    },
  },
  {
    files: ["src/lib/report-server.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        { paths: [...HEIC_PATHS, ...SENTRY_BROWSER_PATHS], patterns: [...HEIC_PATTERNS, SENTRY_PATTERNS[0]] },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Device check (npm run test:devices)
    ".next-devices/**",
    "device-report/**",
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
