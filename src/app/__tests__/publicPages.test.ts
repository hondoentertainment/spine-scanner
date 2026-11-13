import { describe, expect, it } from 'vitest';
import {
  getBrandingSubtitle,
  getDocumentTitle,
  getPublicPageFromHash,
  getPublicPageFromPath,
  legacyHashToPath,
} from '../publicPages';

describe('public page routing helpers', () => {
  it('recognizes the public pages from a hash or path', () => {
    expect(getPublicPageFromHash('privacy')).toBe('privacy');
    expect(getPublicPageFromHash('book-978')).toBeNull();
    expect(getPublicPageFromPath('/support')).toBe('support');
    expect(getPublicPageFromPath('/library')).toBeNull();
    expect(getPublicPageFromPath('/')).toBeNull();
  });

  it('maps legacy hashes onto path routes and ignores unknown ones', () => {
    expect(legacyHashToPath('')).toBeNull();
    expect(legacyHashToPath('not-a-page')).toBeNull();
    expect(legacyHashToPath('about')).toBe('/about');
    expect(legacyHashToPath('book-9780141036144')).toBe('/library?isbn=9780141036144');
    expect(legacyHashToPath('book-978%2D014')).toBe('/library?isbn=978-014');
    expect(legacyHashToPath('book-')).toBeNull();
  });

  it('builds route titles and the line under the logo', () => {
    expect(getDocumentTitle('/library', null)).toMatch(/Library/);
    expect(getDocumentTitle('/scan', null)).toBe('SpineScanner');
    expect(getDocumentTitle('/recommendations', null)).toMatch(/Suggestions/);
    expect(getDocumentTitle('/data', null)).toMatch(/Data/);
    expect(getDocumentTitle('/profile', null)).toMatch(/Profile/);
    expect(getDocumentTitle('/home', null)).toMatch(/Home/);
    expect(getDocumentTitle('/unknown', null)).toBe('SpineScanner');
    expect(getDocumentTitle('/privacy', 'privacy')).toMatch(/Privacy Policy/);
    expect(getBrandingSubtitle('/home', null)).toMatch(/reading feed/);
    expect(getBrandingSubtitle('/scan', null)).toMatch(/ISBN/);
    expect(getBrandingSubtitle('/library', null)).toMatch(/Browse/);
    expect(getBrandingSubtitle('/recommendations', null)).toMatch(/shelves/);
    expect(getBrandingSubtitle('/data', null)).toMatch(/back up/);
    expect(getBrandingSubtitle('/profile', null)).toMatch(/preferences/);
    expect(getBrandingSubtitle('/somewhere-else', null)).toMatch(/ISBN/);
    expect(getBrandingSubtitle('/about', 'about')).toMatch(/About/);
  });
});
