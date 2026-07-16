import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    fileParallelism: false,
    maxWorkers: 1,
    passWithNoTests: false,
    pool: "forks",
    sequence: {
      concurrent: false,
    },
  },
});
