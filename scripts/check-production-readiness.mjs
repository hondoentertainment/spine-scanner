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
    if (!process.env.VERCEL) {
      addWarning('VITE_BASE_PATH is not set. The app will fall back to its build defaults.');
    }
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

  if (process.env.VERCEL && rawValue !== '/') {
    addError('Vercel production builds must use VITE_BASE_PATH=/ so routes and PWA scope resolve from the domain root.');
  }
}

function validateSupportEmail(rawValue, appEnvironment) {
  if (!rawValue) {
    if (appEnvironment === 'production') addError('VITE_SUPPORT_EMAIL is required for production support links.');
    else addWarning('VITE_SUPPORT_EMAIL is not set. Public support links will be incomplete.');
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
  }
}

function validateAppEnvironment(rawValue, requireProduction) {
  if (!rawValue) {
    if (requireProduction) addError('VITE_APP_ENV=production is required for production deploy checks.');
    else addWarning('VITE_APP_ENV is not set. Monitoring will fall back to the Vite mode.');
    return;
  }

  const allowed = new Set(['production', 'staging', 'preview', 'development', 'test']);
  if (!allowed.has(rawValue)) {
    addWarning(`VITE_APP_ENV is "${rawValue}". Use a stable environment label for monitoring filters.`);
  }

  if (requireProduction && rawValue !== 'production') {
    addError(`VITE_APP_ENV must be "production" for production deploy checks. Received "${rawValue}".`);
  }
}

function validateRelease(rawValue, appEnvironment) {
  if (!rawValue) {
    if (appEnvironment === 'production') addError('VITE_APP_RELEASE is required for production release traceability.');
    else addWarning('VITE_APP_RELEASE is not set. Monitoring events will not be tied to a release identifier.');
  }
}

function validateAppMode(rawValue) {
  if (!rawValue) return;
  const allowed = new Set(['mvp', 'full']);
  if (!allowed.has(rawValue)) {
    addError(`VITE_APP_MODE must be empty, "mvp", or "full". Received "${rawValue}".`);
  }
}

function validateSupabasePair(url, anonKey) {
  if ((url && !anonKey) || (!url && anonKey)) {
    addError('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set together, or both omitted for local-only mode.');
  }
}

function validatePlausible(domain, scriptSrc) {
  if (!domain && scriptSrc) {
    addError('VITE_PLAUSIBLE_SCRIPT_SRC requires VITE_PLAUSIBLE_DOMAIN so analytics can be attributed correctly.');
  }

  if (domain && domain.includes(' ')) {
    addError('VITE_PLAUSIBLE_DOMAIN must not contain spaces.');
  }

  if (scriptSrc) {
    try {
      const parsed = new URL(scriptSrc);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        addError('VITE_PLAUSIBLE_SCRIPT_SRC must use http or https.');
      }
    } catch {
      addError(`VITE_PLAUSIBLE_SCRIPT_SRC must be a valid absolute URL. Received "${scriptSrc}".`);
    }
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
const supabaseUrl = readEnv('VITE_SUPABASE_URL');
const supabaseAnonKey = readEnv('VITE_SUPABASE_ANON_KEY');
const plausibleDomain = readEnv('VITE_PLAUSIBLE_DOMAIN');
const plausibleScriptSrc = readEnv('VITE_PLAUSIBLE_SCRIPT_SRC');
const requireProduction = process.env.VERCEL_ENV === 'production' || process.env.SPINESCANNER_PRODUCTION_CHECK === 'true';

validateSiteUrl(siteUrl);
validateBasePath(basePath);
validateSupportEmail(supportEmail, appEnvironment);
validateDebugFlag(scannerDebug);
validateMonitoring(sentryDsn);
validateAppEnvironment(appEnvironment, requireProduction);
validateRelease(appRelease, appEnvironment);
validateAppMode(appMode);
validateSupabasePair(supabaseUrl, supabaseAnonKey);
validatePlausible(plausibleDomain, plausibleScriptSrc);

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
