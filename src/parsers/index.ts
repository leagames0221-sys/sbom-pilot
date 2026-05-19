/**
 * Layer-1 parsers barrel + manifest-type dispatcher.
 *
 * Re-exports the four ecosystem parsers (npm / pnpm / pip / go-mod) and
 * provides a single-entrypoint dispatch function that detects the project's
 * manifest type by file presence and routes to the appropriate parser.
 *
 * Detection priority (per tasks.md T-12 Verify):
 *   1. pnpm-lock.yaml       → pnpm parser
 *   2. package-lock.json    → npm  parser  (chosen over a bare package.json)
 *   3. package.json         → npm  parser  (lockfile-less; underlying parser
 *                                            will surface the missing lockfile)
 *   4. requirements.txt     → pip  parser
 *   5. go.mod               → Go   parser
 *
 * Empty directory (no supported manifest) → throws a DispatchError with
 * `exitCode = EX_DATAERR` for the CLI layer to map.
 *
 * Per ADR-0006 module boundary: Layer 1 barrel. No imports from scanners /
 * emitters / CLI.
 *
 * Spec mapping: AC-001-1, AC-001-4, ADR-0005, ADR-0006.
 */
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { EX_DATAERR } from '../exit-codes.js';
import type { SbomIR } from '../ir/index.js';

import { parseNpmProject, type NpmParseOptions } from './npm.js';
import { parsePnpmProject } from './pnpm.js';
import { parsePipProject, type PipParseOptions } from './pip.js';
import {
  parseGoModProject,
  type GoModParseOptions,
} from './go-mod.js';

export {
  parseNpmProject,
  npmPurl,
  type NpmParseOptions,
} from './npm.js';
export {
  parsePnpmProject,
  parsePnpmPackageKey,
} from './pnpm.js';
export {
  parsePipProject,
  parseRequirementLine,
  joinContinuations,
  pypiPurl,
  type PipParseOptions,
  type ParsedRequirement,
} from './pip.js';
export {
  parseGoModProject,
  parseGoModText,
  stripGoLineComment,
  golangPurl,
  type GoModParseOptions,
  type GoModRequire,
} from './go-mod.js';

export type ManifestType = 'pnpm' | 'npm' | 'pip' | 'go-mod';

export interface ParseOptions
  extends NpmParseOptions,
    PipParseOptions,
    GoModParseOptions {}

/**
 * Error thrown when {@link dispatchParser} cannot identify a supported
 * manifest type in the project directory. The `exitCode` is shaped for
 * direct mapping by the CLI layer; consumers should NOT use the `Error`
 * message as a stable contract — the message wording may change.
 */
export class DispatchError extends Error {
  readonly exitCode: number;
  constructor(message: string, exitCode: number) {
    super(message);
    this.name = 'DispatchError';
    this.exitCode = exitCode;
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    const stat = await fs.stat(path);
    return stat.isFile();
  } catch {
    return false;
  }
}

/**
 * Detect the manifest type in `projectDir` by file presence, applying the
 * priority order documented at the module header. Returns `null` if no
 * supported manifest is found.
 */
export async function detectManifest(
  projectDir: string,
): Promise<ManifestType | null> {
  const checks: ReadonlyArray<{ file: string; type: ManifestType }> = [
    { file: 'pnpm-lock.yaml', type: 'pnpm' },
    { file: 'package-lock.json', type: 'npm' },
    { file: 'package.json', type: 'npm' },
    { file: 'requirements.txt', type: 'pip' },
    { file: 'go.mod', type: 'go-mod' },
  ];
  for (const { file, type } of checks) {
    if (await fileExists(join(projectDir, file))) return type;
  }
  return null;
}

/**
 * Detect the manifest type in `projectDir` and produce an SbomIR by
 * dispatching to the matching ecosystem parser.
 *
 * Throws {@link DispatchError} with `exitCode = EX_DATAERR` when no
 * supported manifest is present. Other parser-internal failures (missing
 * lockfile, unparseable file) propagate from the underlying parser.
 */
export async function dispatchParser(
  projectDir: string,
  options: ParseOptions = {},
): Promise<SbomIR> {
  const manifest = await detectManifest(projectDir);
  switch (manifest) {
    case 'pnpm':
      return parsePnpmProject(projectDir, options);
    case 'npm':
      return parseNpmProject(projectDir, options);
    case 'pip':
      return parsePipProject(projectDir, options);
    case 'go-mod':
      return parseGoModProject(projectDir, options);
    case null:
      throw new DispatchError(
        `No supported manifest detected in ${projectDir} (expected one of: pnpm-lock.yaml, package-lock.json, package.json, requirements.txt, go.mod)`,
        EX_DATAERR,
      );
  }
}
