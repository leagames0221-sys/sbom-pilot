import { describe, it, expect } from 'vitest';
import {
  EX_OK,
  EX_USAGE,
  EX_DATAERR,
  EX_NOINPUT,
  EX_UNAVAILABLE,
  EX_SOFTWARE,
  EX_OSFILE,
  EX_IOERR,
  EX_TEMPFAIL,
  EX_NOPERM,
  EX_CONFIG,
  ExitCodes,
  type ExitCode,
} from '../../src/exit-codes.js';

describe('exit-codes', () => {
  it('exposes 11 sysexits constants', () => {
    expect(Object.keys(ExitCodes)).toHaveLength(11);
  });

  it.each([
    ['EX_OK', EX_OK, 0],
    ['EX_USAGE', EX_USAGE, 64],
    ['EX_DATAERR', EX_DATAERR, 65],
    ['EX_NOINPUT', EX_NOINPUT, 66],
    ['EX_UNAVAILABLE', EX_UNAVAILABLE, 69],
    ['EX_SOFTWARE', EX_SOFTWARE, 70],
    ['EX_OSFILE', EX_OSFILE, 72],
    ['EX_IOERR', EX_IOERR, 74],
    ['EX_TEMPFAIL', EX_TEMPFAIL, 75],
    ['EX_NOPERM', EX_NOPERM, 77],
    ['EX_CONFIG', EX_CONFIG, 78],
  ])('%s matches BSD sysexits.h literal value (%i = %i)', (_name, actual, expected) => {
    expect(actual).toBe(expected);
  });

  it('groups all exports under the ExitCodes record', () => {
    expect(ExitCodes.EX_OK).toBe(EX_OK);
    expect(ExitCodes.EX_USAGE).toBe(EX_USAGE);
    expect(ExitCodes.EX_DATAERR).toBe(EX_DATAERR);
    expect(ExitCodes.EX_NOINPUT).toBe(EX_NOINPUT);
    expect(ExitCodes.EX_UNAVAILABLE).toBe(EX_UNAVAILABLE);
    expect(ExitCodes.EX_SOFTWARE).toBe(EX_SOFTWARE);
    expect(ExitCodes.EX_OSFILE).toBe(EX_OSFILE);
    expect(ExitCodes.EX_IOERR).toBe(EX_IOERR);
    expect(ExitCodes.EX_TEMPFAIL).toBe(EX_TEMPFAIL);
    expect(ExitCodes.EX_NOPERM).toBe(EX_NOPERM);
    expect(ExitCodes.EX_CONFIG).toBe(EX_CONFIG);
  });

  it('all sysexits values fall in the BSD reserved range (0 or 64-78)', () => {
    for (const [name, value] of Object.entries(ExitCodes)) {
      const inReservedRange = value === 0 || (value >= 64 && value <= 78);
      expect(inReservedRange, `${name}=${value} not in 0/64-78`).toBe(true);
    }
  });

  it('treats ExitCode as a number-narrowed union', () => {
    const value: ExitCode = EX_USAGE;
    expect(typeof value).toBe('number');
  });
});
