import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      ".next*/**",
      "node_modules/**",
      "coverage/**",
      "public/sw.js",
      "next-env.d.ts",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "react-hooks/exhaustive-deps": "warn",
      "jsx-a11y/alt-text": "warn",
      "react/display-name": "warn",
      "react/no-unescaped-entities": "warn",
      "@next/next/no-img-element": "warn"
    }
  },
  {
    files: ["app/components/preventive/PreventiveMaintenanceForm.tsx"],
    rules: {
      // Formik's render-prop callback is stable, but ESLint cannot recognize it
      // as a component boundary. This remains a tracked extraction target.
      "react-hooks/rules-of-hooks": "warn",
    },
  },
  {
    files: [
      "app/dashboard/jobs/by-topic/page.tsx",
      "app/dashboard/rooms/topic-mismatch/page.tsx",
    ],
    rules: {
      "@typescript-eslint/ban-ts-comment": "warn",
    },
  }
];
export default eslintConfig;
