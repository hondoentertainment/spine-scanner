import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const scriptPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../check-production-readiness.mjs',
);

type CheckResult = {
  status: number;
  stdout: string;
  stderr: string;
};

function runCheck(overrides: Record<string, string | undefined>): CheckResult {
  const result = spawnSync(process.execPath, [scriptPath], {
    env: { ...process.env, ...overrides },
    encoding: 'utf8',
  });

  return {
    status: result.status ?? -1,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

const validProductionEnv = {
  VITE_SITE_URL: 'https://app.spinescanner.dev',
  VITE_BASE_PATH: '/',
  VITE_SUPPORT_EMAIL: 'support@spinescanner.dev',
  VITE_ENABLE_SCANNER_DEBUG: 'false',
  VITE_APP_ENV: 'production',
  VITE_APP_RELEASE: 'abc123',
  VITE_SENTRY_DSN: '',
  VITE_APP_MODE: '',
};

describe('check-production-readiness script', () => {
  it('passes for valid production values', () => {
    const result = runCheck(validProductionEnv);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Production readiness check passed.');
  });

  it('fails when production uses example.com as site URL', () => {
    const result = runCheck({
      ...validProductionEnv,
      VITE_SITE_URL: 'https://example.com',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('VITE_SITE_URL cannot use example.com in production.');
  });

  it('fails when production uses localhost as site URL', () => {
    const result = runCheck({
      ...validProductionEnv,
      VITE_SITE_URL: 'http://localhost:4173',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('VITE_SITE_URL cannot target localhost in production.');
  });

  it('fails when production uses placeholder support email', () => {
    const result = runCheck({
      ...validProductionEnv,
      VITE_SUPPORT_EMAIL: 'noreply@example.com',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('VITE_SUPPORT_EMAIL cannot use example.* placeholder domains in production.');
  });

  it('allows placeholder values outside production environment', () => {
    const result = runCheck({
      ...validProductionEnv,
      VITE_APP_ENV: 'test',
      VITE_SITE_URL: 'https://example.com',
      VITE_SUPPORT_EMAIL: 'noreply@example.com',
    });

    expect(result.status).toBe(0);
  });

  it('fails when Sentry DSN is not a valid URL', () => {
    const result = runCheck({
      ...validProductionEnv,
      VITE_SENTRY_DSN: 'not-a-url',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('VITE_SENTRY_DSN must be a valid URL when set.');
  });

  it('fails when production release id is missing', () => {
    const result = runCheck({
      ...validProductionEnv,
      VITE_APP_RELEASE: '',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('VITE_APP_RELEASE must be set when VITE_APP_ENV=production.');
  });
});
