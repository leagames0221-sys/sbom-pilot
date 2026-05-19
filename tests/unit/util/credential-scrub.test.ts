import { describe, expect, it } from 'vitest';
import { scrubCredentials, detectCredentialRules } from '../../../src/util/credential-scrub.js';

const MASK = '<REDACTED>';

describe('scrubCredentials', () => {
  it('returns empty string unchanged', () => {
    expect(scrubCredentials('')).toBe('');
  });

  it('returns content without credentials unchanged', () => {
    expect(scrubCredentials('hello world\nplain text\n')).toBe('hello world\nplain text\n');
  });

  it('masks Bearer header tokens', () => {
    const input = 'Authorization: Bearer abcdef1234567890XYZ';
    expect(scrubCredentials(input)).toBe(`Authorization: Bearer ${MASK}`);
  });

  it('masks Basic auth payloads case-insensitively', () => {
    const input = 'authorization: basic dXNlcjpwYXNz';
    expect(scrubCredentials(input)).toBe(`authorization: basic ${MASK}`);
  });

  it('masks AWS access key IDs (AKIA prefix)', () => {
    const input = 'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE';
    const out = scrubCredentials(input);
    expect(out).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(out).toContain(MASK);
  });

  it('masks AWS temporary credentials (ASIA prefix)', () => {
    const out = scrubCredentials('token: ASIAYZIE6GE2EXAMPLE2');
    expect(out).not.toContain('ASIAYZIE6GE2EXAMPLE2');
  });

  it('masks GitHub personal access tokens in bare context', () => {
    // No assignment context here — exercises the github-token rule directly,
    // not the env-style-secret rule which would otherwise match GITHUB_TOKEN=...
    const input = 'curl -u user:ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789 https://api';
    const out = scrubCredentials(input);
    expect(out).not.toContain('ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789');
    expect(out).toContain('gh_');
  });

  it('masks npm tokens in bare context', () => {
    const input = '//registry.npmjs.org/:_authToken=npm_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123';
    const out = scrubCredentials(input);
    expect(out).not.toContain('npm_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123');
  });

  it('masks env-style API_KEY assignments', () => {
    const input = 'ANTHROPIC_API_KEY=sk-ant-zzzzzzzzzzzzzzzzzzzzzzzz';
    const out = scrubCredentials(input);
    expect(out).toBe(`ANTHROPIC_API_KEY=${MASK}`);
  });

  it('masks env-style PASSWORD assignments', () => {
    expect(scrubCredentials('DB_PASSWORD=hunter2')).toBe(`DB_PASSWORD=${MASK}`);
  });

  it('masks url-query password parameters case-insensitively', () => {
    const out = scrubCredentials('host://?password=hunter2&other=x');
    expect(out).toContain(`password=${MASK}`);
    expect(out).not.toContain('hunter2');
  });

  it('masks JWT-shaped tokens', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
      'eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4ifQ.' +
      'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const out = scrubCredentials(`token: ${jwt}`);
    expect(out).not.toContain(jwt);
    expect(out).toContain('JWT_');
  });

  it('masks multiple distinct credentials in one payload', () => {
    const input = [
      'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE',
      'export GITHUB_TOKEN=ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789',
      'curl -H "Authorization: Bearer xyz12345abcdef"',
    ].join('\n');
    const out = scrubCredentials(input);
    expect(out).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(out).not.toContain('ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789');
    expect(out).not.toContain('xyz12345abcdef');
  });

  it('does not over-eagerly mask harmless substrings like "key" without =', () => {
    const out = scrubCredentials('The key to success is consistency.');
    expect(out).toBe('The key to success is consistency.');
  });

  describe('detectCredentialRules', () => {
    it('reports empty array on clean input', () => {
      expect(detectCredentialRules('hello world')).toEqual([]);
    });

    it('reports the bearer rule on a Bearer header', () => {
      expect(detectCredentialRules('Authorization: Bearer abcdef1234567890')).toContain('bearer');
    });

    it('reports multiple rules on a mixed payload', () => {
      const input = 'AKIAIOSFODNN7EXAMPLE Bearer abcdef1234567890';
      const hits = detectCredentialRules(input);
      expect(hits).toContain('aws-access-key-id');
      expect(hits).toContain('bearer');
    });
  });
});
