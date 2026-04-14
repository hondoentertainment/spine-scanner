/**
 * Aligns `<html lang>` with the user agent for assistive tech and future i18n.
 */
export function syncDocumentLocale(): void {
  if (typeof document === 'undefined') return;
  const lang =
    typeof navigator !== 'undefined' && navigator.language && navigator.language.trim() !== ''
      ? navigator.language
      : 'en';
  document.documentElement.lang = lang;
}
