import { defineConfig } from "vitest/config";

/** Config isolée — ne charge pas vite.config (proxies / import.meta.env). */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
