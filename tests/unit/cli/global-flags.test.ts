/**
 * Unit tests for the global-flags resolver + writer wrappers (T-32).
 *
 * Spec mapping: AC-005-4, ADR-0006.
 */
import { describe, expect, it } from 'vitest';
import {
  resolveGlobalFlags,
  wrapStderr,
  wrapWriter,
} from '../../../src/cli/global-flags.js';

describe('resolveGlobalFlags', () => {
  it('--no-color flag forces noColor=true', () => {
    expect(resolveGlobalFlags(['--no-color'], {}).noColor).toBe(true);
  });

  it('NO_COLOR env forces noColor=true', () => {
    expect(resolveGlobalFlags([], { NO_COLOR: '1' }).noColor).toBe(true);
  });

  it('FORCE_COLOR overrides NO_COLOR + --no-color', () => {
    const flags = resolveGlobalFlags(['--no-color'], {
      FORCE_COLOR: '1',
      NO_COLOR: '1',
    });
    expect(flags.noColor).toBe(false);
  });

  it('--quiet sets quiet=true', () => {
    expect(resolveGlobalFlags(['--quiet'], {}).quiet).toBe(true);
  });

  it('-q short alias sets quiet=true', () => {
    expect(resolveGlobalFlags(['-q'], {}).quiet).toBe(true);
  });

  it('no flags / no env → both false', () => {
    expect(resolveGlobalFlags([], {})).toEqual({
      noColor: false,
      quiet: false,
    });
  });
});

describe('wrapWriter — ANSI strip', () => {
  it('passes through unchanged when noColor=false', () => {
    const lines: string[] = [];
    const writer = wrapWriter((s) => lines.push(s), { noColor: false, quiet: false });
    const colored = `${String.fromCharCode(0x1b)}[31mERROR${String.fromCharCode(0x1b)}[0m`;
    writer(colored);
    expect(lines[0]).toBe(colored);
  });

  it('strips ANSI when noColor=true', () => {
    const lines: string[] = [];
    const writer = wrapWriter((s) => lines.push(s), { noColor: true, quiet: false });
    const colored = `${String.fromCharCode(0x1b)}[31mERROR${String.fromCharCode(0x1b)}[0m`;
    writer(colored);
    expect(lines[0]).toBe('ERROR');
  });
});

describe('wrapStderr — --quiet filter', () => {
  it('passes through all lines when quiet=false', () => {
    const lines: string[] = [];
    const writer = wrapStderr((s) => lines.push(s), { noColor: false, quiet: false });
    writer('chatty info line');
    writer('something failed');
    expect(lines).toEqual(['chatty info line', 'something failed']);
  });

  it('drops non-error lines when quiet=true', () => {
    const lines: string[] = [];
    const writer = wrapStderr((s) => lines.push(s), { noColor: false, quiet: true });
    writer('chatty info line');
    writer('something failed');
    writer('error: bad thing happened');
    expect(lines).toEqual(['something failed', 'error: bad thing happened']);
  });

  it('--quiet composes with noColor (strip ANSI from surviving lines)', () => {
    const lines: string[] = [];
    const writer = wrapStderr((s) => lines.push(s), { noColor: true, quiet: true });
    writer(`${String.fromCharCode(0x1b)}[31merror: bad${String.fromCharCode(0x1b)}[0m`);
    expect(lines).toEqual(['error: bad']);
  });
});
