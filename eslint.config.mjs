import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// No em dashes in copy (CLAUDE.md, Copy). Comments are fine, and so is a lone
// "—" standing in for an empty value, which is a glyph, not a sentence.
const EM_DASH_MESSAGE =
  "Em dash in copy. Don't swap it for a period or comma: rewrite the sentence, or ask Connor. See CLAUDE.md, Copy.";

const HEIC_MESSAGE =
  "heic-to loads only through the dynamic import in src/lib/attachments/heic.ts (heicToJpeg), so it stays out of every page's bundle.";

// Brand values come from the tokens in src/app/globals.css, so a re-brand is a
// token swap (docs/brand-guidelines.md, section 11). A value the tokens can't
// carry (a fixed size the guidelines name) takes an eslint-disable-next-line
// comment saying why.
const DESIGN_VALUE_RULES = [
  {
    pattern: /-\[#/,
    message: "Hex color in an arbitrary value. Use a color token from globals.css (text-fg-2, bg-canvas, border-line).",
  },
  {
    pattern: /\btext-\[\d/,
    message: "Arbitrary text size. Use a type token (text-body, text-meta, text-micro) from globals.css.",
  },
  {
    pattern: /\b(?:zinc|blue|red|amber|green|purple)-\d{2,3}\b/,
    message:
      "Raw palette color. Use a token from globals.css: fg-*, fill-*, line-* for neutrals; danger, warn, ok for status.",
  },
  {
    pattern: /\btext-(?:xs|sm|base|lg|[2-9]?xl)\b/,
    message: "Tailwind text size. Use the type token for the role: text-body, text-label, text-meta or text-micro (section 3).",
  },
  {
    // The aliases are gone from globals.css, so one of these would draw nothing.
    pattern:
      /\b(?:text|bg|border(?:-[trblxyse])?|divide|ring|outline|fill|stroke|decoration)-(?:muted|foreground|background|border|primary(?:-foreground)?|accent)\b/,
    message:
      "Retired alias. text-muted is text-fg-3, text-foreground text-fg-1, bg-background bg-fill-1, border-border border-line, bg-accent bg-fill-2, primary the act tokens.",
  },
];

/** Reports a string, template string or JSX attribute holding a raw design value. */
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
    plugins: { hg: { rules: { "design-tokens": designTokensRule } } },
    rules: {
      "no-restricted-syntax": [
        "error",
        { selector: "JSXText[value=/—/]:not([value=/^\\s*—\\s*$/])", message: EM_DASH_MESSAGE },
        { selector: "Literal[value=/—/]:not([value='—'])", message: EM_DASH_MESSAGE },
        { selector: "TemplateElement[value.raw=/—/]", message: EM_DASH_MESSAGE },
      ],
      "hg/design-tokens": "error",
      // The HEIC decoder (libheif, LGPL-3.0, about 3 MB) ships as its own lazy
      // chunk, reached only through the dynamic import in
      // src/lib/attachments/heic.ts. A static import would put it in a page's
      // bundle. Dynamic import() isn't checked by this rule.
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [{ name: "heic-to", message: HEIC_MESSAGE, allowTypeImports: true }],
          patterns: [{ group: ["heic-to/*"], message: HEIC_MESSAGE, allowTypeImports: true }],
        },
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
