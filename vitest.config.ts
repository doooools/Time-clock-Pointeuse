import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["shared/**/*.test.ts", "server/**/*.test.ts", "test/**/*.test.ts", "scripts/**/*.test.ts"],
    environment: "node",
  },
});
