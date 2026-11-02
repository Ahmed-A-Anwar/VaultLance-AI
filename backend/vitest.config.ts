import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    fileParallelism: false,
    environment: "node",
    env: {
      USE_IN_MEMORY_DB: "true",
    },
  },
});
