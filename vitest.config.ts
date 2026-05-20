import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'coverage'],
    reporters: ['default'],
    passWithNoTests: true,
    // Default 5000ms test timeout is too tight for tests that spawn
    // subprocesses on Windows runners — `mask-script.test.ts` spawns
    // python (~6.5-7s cold start) and `dependency-direction.test.ts`
    // spawns the dependency-cruiser CLI (~3s cold). Bump globally to
    // 15s so the 3-OS CI matrix is not flake-prone on cold starts.
    testTimeout: 15000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/types/**',
        'tests/**',
        'scripts/**',
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
    },
  },
});
