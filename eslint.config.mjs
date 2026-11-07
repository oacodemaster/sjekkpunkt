import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // M8 web hardening: no raw HTML sinks and no eval. Model output and worker notes are shown as
  // text only (addendum section 10).
  {
    rules: {
      "react/no-danger": "error",
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-restricted-properties": [
        "error",
        { property: "innerHTML", message: "Render text with React instead (M8)." },
        { property: "outerHTML", message: "Render text with React instead (M8)." },
        { property: "insertAdjacentHTML", message: "Render text with React instead (M8)." },
      ],
    },
  },
  globalIgnores(["public/elevenlabs/**"]),
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
