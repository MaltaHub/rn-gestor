import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // Type-aware: pega promises soltas (sem await/catch/void). Foi essa classe
    // — chamada async cujo erro ninguem trata — que fez o form editor falhar em
    // silencio. `ignoreVoid: true` mantem `void algoAsync()` como escape valido
    // (esses ja sao cobertos pelo GlobalErrorListener em runtime).
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname
      }
    },
    rules: {
      "@typescript-eslint/no-floating-promises": ["error", { ignoreVoid: true, ignoreIIFE: true }]
    }
  }
];

export default eslintConfig;
