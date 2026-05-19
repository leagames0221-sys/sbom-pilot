/**
 * Global CLI flags applied across every subcommand:
 *
 *   --no-color           Force ANSI off in stdout/stderr writers. Honoured
 *                        in addition to NO_COLOR (the conventional env var).
 *   --quiet              Suppress all stderr output except errors.
 *
 * Per ADR-0006 §Decision: Layer 5 helper. Reads `src/util/ansi-strip.ts`
 * (leaf util) when wrapping writers.
 *
 * Spec mapping: AC-005-4, ADR-0006.
 */
import { stripAnsi } from '../util/ansi-strip.js';

export interface GlobalFlagsState {
  /** True when the caller disabled colour. */
  noColor: boolean;
  /** True when the caller suppressed informational stderr. */
  quiet: boolean;
}

/**
 * Inspect `argv` (without the leading node + script segments) and the
 * environment for the conventional NO_COLOR / FORCE_COLOR signals.
 * Returns the resolved flag state. The actual flags are NOT consumed
 * from argv here — commander still sees them. The returned state is
 * the source of truth for the writer wrappers.
 */
export function resolveGlobalFlags(
  argv: ReadonlyArray<string>,
  env: NodeJS.ProcessEnv = process.env,
): GlobalFlagsState {
  const noColorArg = argv.includes('--no-color');
  const noColorEnv = (env['NO_COLOR'] ?? '').length > 0;
  const forceColor = (env['FORCE_COLOR'] ?? '').length > 0;
  const quiet = argv.includes('--quiet') || argv.includes('-q');
  const noColor = forceColor ? false : noColorArg || noColorEnv;
  return { noColor, quiet };
}

/**
 * Wrap a raw `(line: string) => void` writer with the global-flags
 * post-processing — ANSI stripping when noColor is true, no-op when
 * not. Used by the CLI bootstrap to wrap stdout / stderr before
 * passing them to the subcommand actions.
 */
export function wrapWriter(
  writer: (line: string) => void,
  state: GlobalFlagsState,
): (line: string) => void {
  if (!state.noColor) return writer;
  return (line: string) => writer(stripAnsi(line));
}

/**
 * Stderr-specific wrapper that additionally drops INFORMATIONAL lines
 * (every line that does not look like an error) when --quiet is set.
 * "Informational" is heuristic: any line containing the literal string
 * "error", "ERROR" (case-insensitive on "error"), or the word "failed"
 * passes through; everything else is suppressed.
 */
export function wrapStderr(
  writer: (line: string) => void,
  state: GlobalFlagsState,
): (line: string) => void {
  const colored = wrapWriter(writer, state);
  if (!state.quiet) return colored;
  return (line: string) => {
    if (/error|failed/i.test(line)) colored(line);
  };
}
