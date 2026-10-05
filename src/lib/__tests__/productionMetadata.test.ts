import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  APP_DESCRIPTION,
  applyBuildTimeSocialMetadata,
  isPlaceholderSupportEmail,
  socialImageUrl,
} from '../productionMetadata';

const indexHtml = readFileSync('index.html', 'utf8');

describe('productionMetadata', () => {
  it('builds an absolute social image for the Vercel root', () => {
    expect(socialImageUrl('https://spine-scanner.vercel.app', '/')).toBe(
      'https://spine-scanner.vercel.app/social-preview.svg',
    );
  });

  it('builds an absolute social image for a GitHub Pages base path', () => {
    expect(socialImageUrl('https://hondoentertainment.github.io/', '/spine-scanner/')).toBe(
      'https://hondoentertainment.github.io/spine-scanner/social-preview.svg',
    );
  });

  it('bakes absolute share tags and structured data into the homepage', () => {
    const html = applyBuildTimeSocialMetadata(indexHtml, 'https://spine-scanner.vercel.app', '/');

    expect(html).toContain('property="og:image" content="https://spine-scanner.vercel.app/social-preview.svg"');
    expect(html).toContain('name="twitter:image" content="https://spine-scanner.vercel.app/social-preview.svg"');
    expect(html).toContain('rel="canonical" id="canonical-url" href="https://spine-scanner.vercel.app"');
    expect(html).toContain('id="app-structured-data"');
    expect(html).toContain('"@type":"SoftwareApplication"');
    expect(html).toContain(APP_DESCRIPTION);
    expect(html).not.toContain('__SITE_URL__');
    expect(html).not.toContain('%BASE_URL%social-preview.svg');
  });

  it('leaves share image paths untouched when no site URL is configured', () => {
    const html = applyBuildTimeSocialMetadata(indexHtml, undefined, '/spine-scanner/');
    expect(html).toContain('content="%BASE_URL%social-preview.svg"');
    expect(html).not.toContain('app-structured-data');
    expect(html).toContain('href=""');
  });

  it('flags placeholder support inboxes', () => {
    expect(isPlaceholderSupportEmail('noreply@example.com')).toBe(true);
    expect(isPlaceholderSupportEmail('hello@example.org')).toBe(true);
    expect(isPlaceholderSupportEmail('support@spinescanner.app')).toBe(false);
    expect(isPlaceholderSupportEmail('')).toBe(false);
  });
});
