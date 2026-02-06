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
