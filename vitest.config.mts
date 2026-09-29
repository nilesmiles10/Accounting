import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(path.dirname(fileURLToPath(import.meta.url)), "src") },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["src/test/setup.ts"],
    // Elke testfile draait in een eigen proces met een eigen tijdelijke
    // SQLite-db (zie setup.ts) — geen gedeelde state tussen files.
    pool: "forks",
  },
});
