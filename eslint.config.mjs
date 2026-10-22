import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// No em dashes in copy (CLAUDE.md, Copy). Comments are fine, and so is a lone
// "—" standing in for an empty value, which is a glyph, not a sentence.
const EM_DASH_MESSAGE =
  "Em dash in copy. Don't swap it for a period or comma: rewrite the sentence, or ask Connor. See CLAUDE.md, Copy.";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/**/*.test.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        { selector: "JSXText[value=/—/]:not([value=/^\\s*—\\s*$/])", message: EM_DASH_MESSAGE },
        { selector: "Literal[value=/—/]:not([value='—'])", message: EM_DASH_MESSAGE },
        { selector: "TemplateElement[value.raw=/—/]", message: EM_DASH_MESSAGE },
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
