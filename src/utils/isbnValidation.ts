/**
 * Validates ISBN-10 checksum using weighted sum mod 11.
 * The check digit can be 0-9 or 'X' (representing 10).
 */
export const validateISBN10 = (isbn: string): boolean => {
    if (isbn.length !== 10) return false;
    if (!/^[0-9]{9}[0-9X]$/.test(isbn)) return false;

    let sum = 0;
    for (let i = 0; i < 9; i++) {
        sum += parseInt(isbn[i], 10) * (10 - i);
    }
    const check = isbn[9] === 'X' ? 10 : parseInt(isbn[9], 10);
    sum += check;

    return sum % 11 === 0;
};

/**
 * Validates ISBN-13 checksum using alternating 1/3 weighted sum mod 10.
 */
export const validateISBN13 = (isbn: string): boolean => {
    if (isbn.length !== 13) return false;
    if (!/^[0-9]{13}$/.test(isbn)) return false;

    let sum = 0;
    for (let i = 0; i < 13; i++) {
        sum += parseInt(isbn[i], 10) * (i % 2 === 0 ? 1 : 3);
    }

    return sum % 10 === 0;
};

/**
 * Validates an ISBN string (10 or 13 digits).
 * Returns an object with validity status and optional error message.
 */
export const validateISBN = (isbn: string): { valid: boolean; error?: string } => {
    const cleaned = isbn.replace(/[- ]/g, '');

    if (cleaned.length === 10) {
        if (validateISBN10(cleaned)) return { valid: true };
        return { valid: false, error: 'Invalid ISBN-10 checksum' };
    }

    if (cleaned.length === 13) {
        if (validateISBN13(cleaned)) return { valid: true };
        return { valid: false, error: 'Invalid ISBN-13 checksum' };
    }

    return { valid: false, error: 'ISBN must be 10 or 13 digits' };
};
