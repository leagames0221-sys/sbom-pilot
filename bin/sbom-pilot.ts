#!/usr/bin/env node
/**
 * sbom-pilot CLI shebang entry point.
 *
 * The compiled output (dist/bin/sbom-pilot.js) is what npm exposes
 * via the `bin` field in package.json. Production users invoke this
 * file via `pnpm dlx sbom-pilot ...` or `npx sbom-pilot ...`.
 *
 * Per ADR-0006 §Decision: only this file lives in `bin/`; all
 * structural logic is in src/cli/ and the layers below it.
 *
 * Spec mapping: AC-005-1, AC-005-3, AC-005-5, ADR-0006.
 */
import { runCli } from '../src/cli/index.js';

void runCli({
  argv: process.argv.slice(2),
});
