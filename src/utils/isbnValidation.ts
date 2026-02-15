/**
 * Validates an ISBN-10 checksum.
 * The weighted sum (weights 10,9,8,...,1) mod 11 must equal 0.
 * The last digit can be 'X' representing 10.
 */
export const isValidIsbn10 = (isbn: string): boolean => {
  if (isbn.length !== 10) return false;
  if (!/^[0-9]{9}[0-9X]$/.test(isbn)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += (10 - i) * parseInt(isbn[i], 10);
  }
  sum += isbn[9] === 'X' ? 10 : parseInt(isbn[9], 10);

  return sum % 11 === 0;
};

/**
 * Validates an ISBN-13 checksum.
 * Alternating weights of 1 and 3, sum mod 10 must equal 0.
 */
export const isValidIsbn13 = (isbn: string): boolean => {
  if (isbn.length !== 13) return false;
  if (!/^[0-9]{13}$/.test(isbn)) return false;

  let sum = 0;
  for (let i = 0; i < 13; i++) {
    sum += (i % 2 === 0 ? 1 : 3) * parseInt(isbn[i], 10);
  }

  return sum % 10 === 0;
};

/**
 * Validates an ISBN string (10 or 13 digits).
 * Returns true if the checksum is valid.
 */
export const isValidIsbn = (isbn: string): boolean => {
  if (isbn.length === 10) return isValidIsbn10(isbn);
  if (isbn.length === 13) return isValidIsbn13(isbn);
  return false;
};

/**
 * Convert ISBN-13 to ISBN-10 (only for 978 prefix).
 * Returns null if conversion not possible.
 */
export const isbn13To10 = (isbn: string): string | null => {
  const digits = isbn.replace(/[^0-9]/g, '');
  if (digits.length !== 13 || !digits.startsWith('978')) return null;
  const nine = digits.substring(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += (10 - i) * parseInt(nine[i], 10);
  }
  const check = (11 - (sum % 11)) % 11;
  return nine + (check === 10 ? 'X' : String(check));
};

/**
 * Convert ISBN-10 to ISBN-13 (prepend 978).
 */
export const isbn10To13 = (isbn: string): string | null => {
  const digits = isbn.replace(/[^0-9X]/g, '');
  if (digits.length !== 10) return null;
  const prefix = '978';
  const twelve = prefix + digits.substring(0, 9);
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += (i % 2 === 0 ? 1 : 3) * parseInt(twelve[i], 10);
  }
  const check = (10 - (sum % 10)) % 10;
  return twelve + String(check);
};
