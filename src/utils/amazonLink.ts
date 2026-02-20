/**
 * Generates Amazon search link for an ISBN.
 * Set VITE_AMAZON_AFFILIATE_TAG in .env to add your affiliate tag to URLs.
 */
export const generateAmazonLink = (isbn: string): string => {
    const digits = isbn.replace(/[^0-9X]/g, '');
    if (digits.length !== 10 && digits.length !== 13) return '';
    const base = `https://www.amazon.com/s?k=${encodeURIComponent(isbn)}`;
    const tag = import.meta.env.VITE_AMAZON_AFFILIATE_TAG;
    return (typeof tag === 'string' && tag.trim())
        ? `${base}&tag=${encodeURIComponent(tag.trim())}`
        : base;
};
