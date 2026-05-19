/**
 * ANSI escape sequence + C0 control character stripping.
 *
 * Defense-in-depth for output sanitization. User-supplied content (advisory
 * descriptions, package descriptions, manifest fields) may contain hostile
 * ANSI escapes that hijack the user's terminal. We strip them before any
 * emission to stdout / file / SARIF.
 *
 * Spec mapping:
 *   - AC-005-4 (CLI output sanitization on TTY)
 *
 * Reference: ECMA-48 control sequence syntax (CSI / OSC / single-shift),
 *            ANSI escape codes (Wikipedia).
 *
 * Implementation note: control bytes are constructed via String.fromCharCode
 * at module init so the source remains pure ASCII and survives source-tool
 * round-trips that may strip raw control characters.
 */

const ESC = String.fromCharCode(0x1b);
const BEL = String.fromCharCode(0x07);

// CSI: ESC [ parameter-bytes intermediate-bytes final-byte
const CSI_RE = new RegExp(`${ESC}\\[[0-?]*[ -/]*[@-~]`, 'g');
// OSC: ESC ] payload (BEL | ESC \  ST)
const OSC_RE = new RegExp(`${ESC}\\][\\s\\S]*?(?:${BEL}|${ESC}\\\\)`, 'g');
// Other single-byte ESC + final char (e.g. ESC c, ESC D, ESC M, ESC P, ESC 7).
// Covers printable-ASCII final bytes (0x21-0x7e); CSI / OSC are handled by
// their dedicated regexes that ran before this one.
const ESC_RE = new RegExp(`${ESC}[\\x21-\\x7e]`, 'g');
// C0 control chars (0x00-0x1F) excluding \t (0x09), \n (0x0A), \r (0x0D),
// plus DEL (0x7F). Built via character class string.
function buildC0Re(): RegExp {
  const chars: string[] = [];
  for (let cp = 0x00; cp <= 0x1f; cp += 1) {
    if (cp === 0x09 || cp === 0x0a || cp === 0x0d) continue;
    chars.push(String.fromCharCode(cp));
  }
  chars.push(String.fromCharCode(0x7f));
  // Each char goes into a [...] character class. Escape ] and \ defensively
  // (none of our chars are those, but be hygienic).
  const cls = chars.map((c) => c.replace(/[\\\]]/g, '\\$&')).join('');
  return new RegExp(`[${cls}]`, 'g');
}
const C0_RE = buildC0Re();

/**
 * Remove all ANSI escape sequences and C0 control characters from `input`.
 *
 * Preserved characters: `\t` (0x09), `\n` (0x0A), `\r` (0x0D). Everything
 * else in the 0x00-0x1F + 0x7F range is removed.
 *
 * @returns sanitised string safe to emit to a terminal or persistent file.
 */
export function stripAnsi(input: string): string {
  if (input === '') return '';
  return input
    .replace(CSI_RE, '')
    .replace(OSC_RE, '')
    .replace(ESC_RE, '')
    .replace(C0_RE, '');
}
