export const APP_TITLE = 'SpineScanner';
export const APP_DESCRIPTION = 'Digitize and manage your personal book library with barcode scanning, OCR fallback, optional cloud sync, and export-friendly ownership.';

const PLACEHOLDER_EMAILS = new Set(['noreply@example.com', 'support@example.com']);

export function isPlaceholderSupportEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  if (PLACEHOLDER_EMAILS.has(normalized)) return true;
  return normalized.endsWith('@example.com') || normalized.endsWith('@example.org') || normalized.endsWith('@example.net');
}

export function socialImageUrl(siteUrl: string, base: string): string {
  const origin = siteUrl.replace(/\/$/, '');
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  return new URL(`${normalizedBase}social-preview.svg`, `${origin}/`).toString();
}

export function applyBuildTimeSocialMetadata(html: string, siteUrl: string | undefined, base: string): string {
  const origin = siteUrl?.replace(/\/$/, '') ?? '';
  let next = html.replaceAll('__SITE_URL__', origin);
  if (!origin) return next;

  const image = socialImageUrl(origin, base);
  next = next
    .replace(/(<meta\s+property="og:image"\s+content=")[^"]*(")/, `$1${image}$2`)
    .replace(/(<meta\s+name="twitter:image"\s+content=")[^"]*(")/, `$1${image}$2`);

  if (!next.includes('id="app-structured-data"')) {
    const payload = {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: APP_TITLE,
      description: APP_DESCRIPTION,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web',
      url: origin,
      image,
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
    };
    const script = `    <script type="application/ld+json" id="app-structured-data">${JSON.stringify(payload)}</script>\n`;
    next = next.replace('</head>', `${script}  </head>`);
  }

  return next;
}
