/**
 * CLI bootstrap (Layer 5 per ADR-0006).
 *
 * Wires commander with the four subcommand stubs (sbom / scan /
 * report / suggest), the Node-engine gate (AC-005-3), and the
 * `--version` output (AC-005-5).
 *
 * Subcommand actual implementations land at T-30 (sbom + scan), T-31
 * (report + suggest), and T-32 (did-you-mean + global flags). The
 * T-29 stubs print "not implemented yet" and exit with EX_TEMPFAIL so
 * a future regression that accidentally calls a stub fails loudly.
 *
 * Spec mapping: AC-005-1, AC-005-3, AC-005-5, ADR-0006.
 */
import { Command } from 'commander';
import { EX_CONFIG, EX_USAGE } from '../exit-codes.js';
import { formatDidYouMeanLine } from './did-you-mean.js';
import { resolveGlobalFlags, wrapStderr, wrapWriter } from './global-flags.js';
import {
  checkNodeEngine,
  formatVersionLine,
  readPackageVersion,
} from './version.js';
import { sbomAction, type SbomCommandOptions } from './subcommands/sbom.js';
import { scanAction, type ScanCommandOptions } from './subcommands/scan.js';
import {
  reportAction,
  type ReportCommandOptions,
} from './subcommands/report.js';
import {
  suggestAction,
  type SuggestCommandOptions,
} from './subcommands/suggest.js';

export interface CliRunOptions {
  /**
   * The argv array (without the leading node + script entries).
   * `bin/sbom-pilot.ts` passes `process.argv.slice(2)`; tests pass a
   * custom array.
   */
  argv: ReadonlyArray<string>;
  /** Injected runtime version string. Defaults to `process.versions.node`. */
  nodeVersion?: string;
  /** Injected stdout / stderr writers for testability. */
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
  /** Injected exit handler; tests assert on it instead of killing the process. */
  exit?: (code: number) => void;
}

/**
 * Build the commander program. Exposed for tests so they can render
 * `--help` output without invoking process.exit.
 */
export function buildProgram(options: CliRunOptions): Command {
  const rawStdout = options.stdout ?? ((line: string) => process.stdout.write(`${line}\n`));
  const rawStderr = options.stderr ?? ((line: string) => process.stderr.write(`${line}\n`));
  const exit = options.exit ?? ((code: number) => process.exit(code));
  const flags = resolveGlobalFlags(options.argv);
  const stdout = wrapWriter(rawStdout, flags);
  const stderr = wrapStderr(rawStderr, flags);

  const program = new Command();

  program
    .name('sbom-pilot')
    .description(
      'Offline-first SBOM (SPDX 2.3 / CycloneDX 1.5) + vulnerability scan + compliance reports for individual developers and SMBs.',
    )
    .version(formatVersionLine({ version: readPackageVersion(), gitHash: null }), '-V, --version')
    .option('--no-color', 'Disable ANSI colour codes in stdout / stderr.')
    .option('-q, --quiet', 'Suppress informational stderr (errors still surface).')
    // Commander 13.x ships its own "Did you mean" suggestion; turn it
    // off so the AC-005-2 wording ("did you mean: X") comes from our
    // own did-you-mean module (capitalised + colon match the spec).
    .showSuggestionAfterError(false);

  program
    .command('sbom')
    .description('Emit a Software Bill of Materials from a project directory.')
    .argument('<project-dir>', 'Path to the project directory (npm / pnpm / pip / go).')
    .option('-f, --format <format>', 'Output format: spdx | cyclonedx', 'spdx')
    .option('-o, --output <path>', 'Write to <path> atomically instead of stdout.')
    .action(async (projectDir: string, cmdOptions: SbomCommandOptions) => {
      await sbomAction(projectDir, cmdOptions, { stdout, stderr, exit });
    });

  program
    .command('scan')
    .description('Scan a project directory against the offline vuln-db and emit SARIF.')
    .argument('<project-dir>', 'Path to the project directory.')
    .option('-o, --output <path>', 'Write SARIF to <path> atomically.')
    .option(
      '--fail-on <levels>',
      'Comma-separated severity levels that cause non-zero exit (e.g. "critical,high").',
    )
    .option('--refresh', 'Refresh the local vuln-db cache before scanning.')
    .option('--vuln-db <path>', 'Path to the OSV vuln-db cache (overrides the default location).')
    .action(async (projectDir: string, cmdOptions: ScanCommandOptions) => {
      await scanAction(projectDir, cmdOptions, { stdout, stderr, exit });
    });

  program
    .command('report')
    .description('Generate a compliance report against one of four regulations.')
    .argument('<project-dir>', 'Path to the project directory.')
    .option(
      '-s, --standard <name>',
      'Regulation: appi-26-2 | meti-sbom-v2 | ntia | eu-cra (omit to list available standards).',
    )
    .option('-o, --output <path>', 'Write the report to <path> atomically.')
    .option('--vuln-db <path>', 'Path to the OSV vuln-db cache (appi-26-2 uses it for priority findings).')
    .option('--sbom-format <fmt>', 'SBOM format hint for eu-cra (spdx-2.3 or cyclonedx-1.5).')
    .action(async (projectDir: string, cmdOptions: ReportCommandOptions) => {
      await reportAction(projectDir, cmdOptions, { stdout, stderr, exit });
    });

  program
    .command('suggest')
    .description('Produce a free-text upgrade suggestion using the configured LLM provider.')
    .argument('<advisory-id>', 'Advisory id (e.g. GHSA-xxxx-yyyy-zzzz) or component name.')
    .option(
      '-p, --provider <name>',
      'LLM provider: mock | ollama | anthropic | openai (default: try ollama, fall back to mock).',
    )
    .action(async (advisoryId: string, cmdOptions: SuggestCommandOptions) => {
      await suggestAction(advisoryId, cmdOptions, { stdout, stderr, exit });
    });

  // Commander writes to its own stdout/stderr by default; reroute when
  // injected so tests can assert against captured output.
  program.configureOutput({
    writeOut: (s: string) => stdout(s.replace(/\n$/, '')),
    writeErr: (s: string) => stderr(s.replace(/\n$/, '')),
  });
  program.exitOverride((err) => {
    // Unknown-command path: commander 13.x sets err.code to
    // 'commander.unknownCommand' OR 'commander.unknown'; the safer
    // signal is the message text "unknown command 'X'".
    const unknownMatch = err.message.match(
      /unknown command\s+['"]([^'"]+)['"]/,
    );
    if (unknownMatch !== null) {
      const subcommands = program.commands.map((c) => c.name());
      const typed = unknownMatch[1] ?? '';
      if (typed.length > 0) {
        const hint = formatDidYouMeanLine(typed, subcommands, { limit: 1 });
        if (hint !== null) stderr(hint);
      }
      exit(EX_USAGE);
      throw err;
    }
    // Map commander's internal exit (help / version / parse error) to
    // the injected exit handler so tests don't kill the process.
    exit(err.exitCode);
    throw err;
  });

  return program;
}

/**
 * Top-level CLI entrypoint. Verifies the Node engine, then parses
 * argv. Exit codes are mapped to `EX_CONFIG` (engine), `EX_OK` (help /
 * version / successful run), and per-subcommand failures from
 * T-30..T-32.
 */
export async function runCli(options: CliRunOptions): Promise<void> {
  const stderr = options.stderr ?? ((line: string) => process.stderr.write(`${line}\n`));
  const exit = options.exit ?? ((code: number) => process.exit(code));

  const nodeVersion = options.nodeVersion ?? process.versions.node;
  const engineCheck = checkNodeEngine(nodeVersion);
  if (!engineCheck.ok) {
    stderr(engineCheck.message ?? 'sbom-pilot: unsupported Node version.');
    exit(EX_CONFIG);
    return;
  }

  const program = buildProgram(options);
  try {
    await program.parseAsync(options.argv as string[], { from: 'user' });
  } catch (e) {
    // Commander throws CommanderError on --help / --version / parse
    // errors; the exitOverride already routed them through the
    // injected exit handler. Swallow here so tests don't see them as
    // unhandled rejections.
    if (e instanceof Error && e.name === 'CommanderError') return;
    throw e;
  }
}
