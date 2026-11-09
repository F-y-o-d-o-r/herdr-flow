import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default [
  { ignores: ["node_modules/", ".superpowers/", "**/*.d.ts"] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node, localStorage: "readonly" },
    },
  },
  prettier,
];
