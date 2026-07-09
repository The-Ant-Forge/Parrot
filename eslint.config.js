import js from "@eslint/js";
import globals from "globals";
import tseslint from "@typescript-eslint/eslint-plugin";

// All TypeScript, including root configs (wxt.config.ts, vitest.config.ts) —
// the wxt tsconfig includes the whole repo, so projectService covers them.
const TS_FILES = ["src/**/*.ts", "tests/**/*.ts", "*.ts"];

export default [
  {
    ignores: [".wxt/", ".output/", "dist/", "node_modules/"],
  },
  // Type-checked linting: catches the fire-and-forget promise bug class
  // (no-floating-promises, no-misused-promises) that plain recommended misses.
  ...tseslint.configs["flat/recommended-type-checked"].map((cfg) => ({
    ...cfg,
    files: TS_FILES,
  })),
  {
    files: TS_FILES,
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Async functions as DOM event listeners / observer callbacks are a
      // deliberate pattern here (handlers carry their own try/catch). Keep
      // checking void-return positions in properties and return types.
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { arguments: false } },
      ],
    },
  },
  // Node scripts + JS configs (this file): no type info, plain recommended.
  {
    files: ["scripts/**/*.js", "*.js"],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      ...js.configs.recommended.rules,
    },
  },
];
