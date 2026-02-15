export const generateAmazonLink = (isbn: string) => {
    const digits = isbn.replace(/[^0-9X]/g, '');
    if (digits.length !== 10 && digits.length !== 13) return '';
    return `https://www.amazon.com/s?k=${encodeURIComponent(isbn)}`;
};
