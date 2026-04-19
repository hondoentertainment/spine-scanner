const errors = [];
const warnings = [];

function addError(message) {
  errors.push(message);
}

function addWarning(message) {
  warnings.push(message);
}

function readEnv(name) {
  return (process.env[name] ?? '').trim();
}

function validateSiteUrl(rawValue) {
  if (!rawValue) {
    addError('VITE_SITE_URL is required for production checks.');
    return;
  }

  let parsed;
  try {
    parsed = new URL(rawValue);
  } catch {
    addError(`VITE_SITE_URL must be a valid absolute URL. Received "${rawValue}".`);
    return;
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    addError('VITE_SITE_URL must use http or https.');
  }

  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    addWarning('VITE_SITE_URL should usually be an origin only, for example https://example.com.');
  }
}

function validateBasePath(rawValue) {
  if (!rawValue) {
    addWarning('VITE_BASE_PATH is not set. The app will fall back to its build defaults.');
    return;
  }

  if (!rawValue.startsWith('/')) {
    addError('VITE_BASE_PATH must start with "/".');
  }

  if (!rawValue.endsWith('/')) {
    addError('VITE_BASE_PATH must end with "/".');
  }

  if (rawValue.includes(' ')) {
    addError('VITE_BASE_PATH must not contain spaces.');
  }
}

function validateSupportEmail(rawValue) {
  if (!rawValue) {
    addWarning('VITE_SUPPORT_EMAIL is not set. Public support links will be incomplete.');
    return;
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(rawValue)) {
    addError(`VITE_SUPPORT_EMAIL must be a valid email address. Received "${rawValue}".`);
  }
}

function validateDebugFlag(rawValue) {
  if (rawValue.toLowerCase() === 'true') {
    addError('VITE_ENABLE_SCANNER_DEBUG must be false in production.');
  }
}

function validateMonitoring(rawValue) {
  if (!rawValue) {
    addWarning('VITE_SENTRY_DSN is not set. Production monitoring will be limited.');
    return;
  }

  try {
    const parsed = new URL(rawValue);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      addError('VITE_SENTRY_DSN must use http or https when set.');
    }
  } catch {
    addError('VITE_SENTRY_DSN must be a valid URL when set.');
  }
}

function validateAppEnvironment(rawValue) {
  if (!rawValue) {
    addWarning('VITE_APP_ENV is not set. Monitoring will fall back to the Vite mode.');
    return;
  }

  const allowed = new Set(['production', 'staging', 'preview', 'development', 'test']);
  if (!allowed.has(rawValue)) {
    addWarning(`VITE_APP_ENV is "${rawValue}". Use a stable environment label for monitoring filters.`);
  }
}

function validateRelease(rawValue) {
  if (!rawValue) {
    addWarning('VITE_APP_RELEASE is not set. Monitoring events will not be tied to a release identifier.');
  }
}

function validateAppMode(rawValue) {
  if (!rawValue) return;
  const allowed = new Set(['mvp', 'full']);
  if (!allowed.has(rawValue)) {
    addError(`VITE_APP_MODE must be empty, "mvp", or "full". Received "${rawValue}".`);
  }
}

function isPlaceholderHost(rawValue) {
  if (!rawValue) return false;
  try {
    const parsed = new URL(rawValue);
    return parsed.hostname === 'example.com' || parsed.hostname.endsWith('.example.com');
  } catch {
    return false;
  }
}

function isLocalhostHost(rawValue) {
  if (!rawValue) return false;
  try {
    const parsed = new URL(rawValue);
    return ['localhost', '127.0.0.1', '0.0.0.0'].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function isPlaceholderSupportEmail(rawValue) {
  if (!rawValue) return false;
  const normalized = rawValue.toLowerCase();
  return (
    normalized === 'noreply@example.com' ||
    normalized.endsWith('@example.com') ||
    normalized.endsWith('@example.org') ||
    normalized.endsWith('@example.net')
  );
}

function validateProductionValues(appEnvironment, siteUrl, supportEmail, appRelease) {
  if (appEnvironment !== 'production') {
    return;
  }

  if (!siteUrl) {
    addError('VITE_SITE_URL must be set to the real production origin when VITE_APP_ENV=production.');
  } else {
    if (isPlaceholderHost(siteUrl)) {
      addError('VITE_SITE_URL cannot use example.com in production.');
    }
    if (isLocalhostHost(siteUrl)) {
      addError('VITE_SITE_URL cannot target localhost in production.');
    }
  }

  if (!supportEmail) {
    addError('VITE_SUPPORT_EMAIL must be set to a monitored inbox when VITE_APP_ENV=production.');
  } else if (isPlaceholderSupportEmail(supportEmail)) {
    addError('VITE_SUPPORT_EMAIL cannot use example.* placeholder domains in production.');
  }

  if (!appRelease) {
    addError('VITE_APP_RELEASE must be set when VITE_APP_ENV=production.');
  }
}

const siteUrl = readEnv('VITE_SITE_URL');
const basePath = readEnv('VITE_BASE_PATH');
const supportEmail = readEnv('VITE_SUPPORT_EMAIL');
const scannerDebug = readEnv('VITE_ENABLE_SCANNER_DEBUG');
const sentryDsn = readEnv('VITE_SENTRY_DSN');
const appEnvironment = readEnv('VITE_APP_ENV');
const appRelease = readEnv('VITE_APP_RELEASE');
const appMode = readEnv('VITE_APP_MODE');

validateSiteUrl(siteUrl);
validateBasePath(basePath);
validateSupportEmail(supportEmail);
validateDebugFlag(scannerDebug);
validateMonitoring(sentryDsn);
validateAppEnvironment(appEnvironment);
validateRelease(appRelease);
validateAppMode(appMode);
validateProductionValues(appEnvironment, siteUrl, supportEmail, appRelease);

if (errors.length > 0) {
  console.error('Production readiness check failed:\n');
  for (const error of errors) {
    console.error(`- ERROR: ${error}`);
  }
  if (warnings.length > 0) {
    console.error('\nWarnings:');
    for (const warning of warnings) {
      console.error(`- WARN: ${warning}`);
    }
  }
  process.exit(1);
}

console.log('Production readiness check passed.');
if (warnings.length > 0) {
  console.log('\nWarnings:');
  for (const warning of warnings) {
    console.log(`- WARN: ${warning}`);
  }
}
