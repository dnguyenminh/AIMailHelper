// eslint.config.js — ESLint 9 flat config (optional GĐ1; gate: file ≤ 200 dòng do audit test bảo vệ).
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "coverage/**"] },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "error"
    }
  }
);
