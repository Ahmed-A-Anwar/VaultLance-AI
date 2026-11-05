import { defineConfig } from "vitest/config";

/* Unit tests only: the Playwright specs under tests/ drive a browser and are
   run with `npm run test:e2e`, so they are not part of this runner's include. */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
