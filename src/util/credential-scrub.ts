/**
 * Credential-pattern scrubbing for emitter output.
 *
 * Direct lesson from CVE-2025-65965 (Grype credential disclosure via JSON
 * output, see ADR-0001 §Gate 6): a security tool MUST NOT echo back the
 * credentials it incidentally observes. This module masks well-known
 * credential patterns before any text reaches stdout, a file, or a SARIF
 * result message.
 *
 * Spec mapping:
 *   - AC-NF-credentials (mandatory at every emitter boundary)
 *
 * Patterns covered (case-insensitive where appropriate):
 *   - Bearer / Basic auth headers
 *   - AWS Access Key ID (AKIA / ASIA / AROA / AIDA / AGPA / AIPA prefix
 *     + 16 base32 chars)
 *   - Generic env-style assignments: *_KEY=, *_TOKEN=, *_SECRET=,
 *     *_PASSWORD=, *_PASS=
 *   - password= / token= / secret= / api_key= URL-query style
 *   - JWT-shaped tokens (header.payload.signature with 3 base64url
 *     segments, conservative match)
 *   - GitHub tokens (ghp_/gho_/ghu_/ghs_/ghr_ + base62)
 *   - npm tokens (npm_ + base62)
 *
 * Out of scope (not pattern-detectable; rely on developer hygiene):
 *   - Bare API keys with no surrounding `key=` context
 *   - Database connection strings (multiple shapes)
 */

const MASK = '<REDACTED>';

interface Rule {
  readonly name: string;
  readonly pattern: RegExp;
  readonly mask: (match: string, ...groups: string[]) => string;
}

const RULES: readonly Rule[] = [
  {
    name: 'bearer',
    pattern: /\b(Bearer|Basic)\s+[A-Za-z0-9+/=._-]{8,}/gi,
    mask: (_full, scheme) => `${scheme} ${MASK}`,
  },
  {
    name: 'aws-access-key-id',
    pattern: /\b(AKIA|ASIA|AROA|AIDA|AGPA|AIPA)[0-9A-Z]{16}\b/g,
    mask: () => `AWS_KEY_${MASK}`,
  },
  {
    name: 'github-token',
    pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
    mask: () => `gh_${MASK}`,
  },
  {
    name: 'npm-token',
    pattern: /\bnpm_[A-Za-z0-9]{20,}\b/g,
    mask: () => `npm_${MASK}`,
  },
  {
    name: 'env-style-secret',
    pattern: /([A-Z][A-Z0-9_]*?(?:_KEY|_TOKEN|_SECRET|_PASSWORD|_PASS))\s*=\s*([^\s,"';)\]]+)/g,
    mask: (_full, key) => `${key}=${MASK}`,
  },
  {
    name: 'url-style-secret',
    pattern: /\b(password|token|secret|api[_-]?key|apikey)\s*=\s*([^\s,"';)&]+)/gi,
    mask: (_full, key) => `${key.toLowerCase()}=${MASK}`,
  },
  {
    name: 'jwt',
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    mask: () => `JWT_${MASK}`,
  },
];

/**
 * Scrub credential-looking substrings out of `input`.
 *
 * The scrubber is intentionally over-eager: false positives produce
 * `<REDACTED>` markers in output (harmless), but false negatives leak
 * credentials (catastrophic). Tests in `tests/unit/util/credential-scrub.test.ts`
 * inject synthetic credentials and assert ZERO leakage.
 */
export function scrubCredentials(input: string): string {
  if (input === '') return '';
  let out = input;
  for (const rule of RULES) {
    out = out.replace(rule.pattern, rule.mask);
  }
  return out;
}

/**
 * Diagnostic helper for tests + audit logging: returns the list of rule
 * names whose patterns matched against the input. Does not mutate input.
 */
export function detectCredentialRules(input: string): readonly string[] {
  const hits: string[] = [];
  for (const rule of RULES) {
    if (rule.pattern.test(input)) hits.push(rule.name);
    rule.pattern.lastIndex = 0;
  }
  return hits;
}
