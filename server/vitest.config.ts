import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globalSetup: "./tests/globalSetup.ts",
    fileParallelism: false,
    env: {
      DATABASE_URL: "file:./test.db",
      JWT_SECRET: "test-secret",
      NODE_ENV: "test",
    },
  },
});
