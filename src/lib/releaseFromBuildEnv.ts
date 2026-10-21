export function releaseFromBuildEnv(env: Record<string, string | undefined>): string {
  const explicit = env.VITE_APP_RELEASE?.trim() ?? '';
  if (explicit) return explicit;
  return (env.VERCEL_GIT_COMMIT_SHA || env.GITHUB_SHA || '').trim();
}

export function resolveAppRelease(configured: string | undefined, dev: boolean): string {
  const explicit = configured?.trim() ?? '';
  if (explicit) return explicit;
  return dev ? 'dev-local' : '';
}
