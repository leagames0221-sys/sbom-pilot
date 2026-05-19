import { describe, expect, it } from 'vitest';
import { stripAnsi } from '../../../src/util/ansi-strip.js';

const ESC = String.fromCharCode(0x1b);
const BEL = String.fromCharCode(0x07);

describe('stripAnsi', () => {
  it('returns empty string unchanged', () => {
    expect(stripAnsi('')).toBe('');
  });

  it('returns plain ASCII unchanged', () => {
    expect(stripAnsi('hello world')).toBe('hello world');
  });

  it('preserves newline, tab, carriage return', () => {
    expect(stripAnsi('a\tb\nc\rd')).toBe('a\tb\nc\rd');
  });

  it('strips a simple SGR color sequence', () => {
    const colored = `${ESC}[31mred${ESC}[0m`;
    expect(stripAnsi(colored)).toBe('red');
  });

  it('strips CSI cursor-move sequences', () => {
    const input = `before${ESC}[2Amiddle${ESC}[1Bend`;
    expect(stripAnsi(input)).toBe('beforemiddleend');
  });

  it('strips an OSC hyperlink sequence (BEL-terminated)', () => {
    const link = `${ESC}]8;;https://example.com${BEL}label${ESC}]8;;${BEL}`;
    expect(stripAnsi(link)).toBe('label');
  });

  it('strips an OSC sequence terminated by ST (ESC backslash)', () => {
    const input = `${ESC}]0;window title${ESC}\\rest`;
    expect(stripAnsi(input)).toBe('rest');
  });

  it('strips single-byte ESC sequences', () => {
    const input = `a${ESC}cb${ESC}Dc`;
    expect(stripAnsi(input)).toBe('abc');
  });

  it('strips C0 controls except tab/newline/CR', () => {
    const ctl = String.fromCharCode(0x01) + 'a' + String.fromCharCode(0x07) + 'b';
    expect(stripAnsi(ctl)).toBe('ab');
  });

  it('strips DEL (0x7F)', () => {
    expect(stripAnsi('a' + String.fromCharCode(0x7f) + 'b')).toBe('ab');
  });

  it('handles a defense-relevant compound attack payload', () => {
    const attack =
      `prefix${ESC}[2J${ESC}[H${ESC}]0;hostile${BEL}` +
      `${ESC}[31mfake-prompt${ESC}[0m\n` +
      'real content';
    expect(stripAnsi(attack)).toBe('prefixfake-prompt\nreal content');
  });
});
