import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Integration tests need time to talk to Redis
    testTimeout: 10_000,
    // Run test files sequentially — they share one Redis instance
    fileParallelism: false,
  },
});
