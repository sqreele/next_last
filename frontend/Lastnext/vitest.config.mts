import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
    tsconfigRaw: {
      compilerOptions: { jsx: "react-jsx" },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["app/**/*.test.{ts,tsx}"],
    coverage: {
      reporter: ["text", "html"],
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
