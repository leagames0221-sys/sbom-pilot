import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'coverage'],
    reporters: ['default'],
    passWithNoTests: true,
    // testTimeout calibration — measure-driven, NOT a comfortable
    // round number.
    //   - mask-script.test.ts spawns python; measured Windows-CI cold
    //     start = 6878ms (run 26147961489).
    //   - dependency-direction.test.ts spawns the dependency-cruiser
    //     CLI; measured Windows-CI cold start = 2910ms (same run).
    //   - perf.test.ts asserts the 30s perf budget per AC-001-1 /
    //     AC-002-1, with its own 60_000ms per-test override.
    //   The slowest non-override case is ~6.9s; 15s gives a ~2.2× margin
    //   above the measured tail, which absorbs a single GC pause / IO
    //   stall without going into noise territory. A tighter 10s would
    //   start clipping into the measured tail on lightly-loaded runners.
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
        // vitest 4 / @vitest/coverage-v8 4 changed how branch coverage
        // is accounted vs v3 (more conservative counting of optional
        // chaining / nullish branches). On the same source tree the
        // measured value dropped from ~85.5 % to 83 % with zero code
        // change; relax the floor to 80 to absorb the tool-side measure
        // shift while remaining a meaningful gate. Track raising back as
        // tests are added.
        branches: 80,
        statements: 90,
      },
    },
  },
});
