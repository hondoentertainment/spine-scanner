import type { BookEntry, SmartShelfRule, SmartShelf } from '../types.ts';

/**
 * Test whether a single rule matches a book.
 */
export function bookMatchesRule(book: BookEntry, rule: SmartShelfRule): boolean {
  const { field, operator, value } = rule;

  // Resolve the field value from the book
  let fieldValue: string | number | undefined;
  switch (field) {
    case 'status':
      fieldValue = book.status;
      break;
    case 'author':
      fieldValue = book.author;
      break;
    case 'title':
      fieldValue = book.title;
      break;
    case 'pageCount':
      fieldValue = book.pageCount;
      break;
    case 'dateAdded':
      fieldValue = book.dateAdded;
      break;
    case 'rating':
      fieldValue = book.rating;
      break;
    case 'metadataSource':
      fieldValue = book.metadataSource;
      break;
    default:
      return false;
  }

  // Handle undefined field values
  if (fieldValue === undefined || fieldValue === null) {
    return false;
  }

  switch (operator) {
    case 'equals':
      return String(fieldValue).toLowerCase() === value.toLowerCase();

    case 'contains':
      return String(fieldValue).toLowerCase().includes(value.toLowerCase());

    case 'greaterThan': {
      const numField = typeof fieldValue === 'number' ? fieldValue : parseFloat(String(fieldValue));
      const numValue = parseFloat(value);
      if (isNaN(numField) || isNaN(numValue)) return false;
      return numField > numValue;
    }

    case 'lessThan': {
      const numField = typeof fieldValue === 'number' ? fieldValue : parseFloat(String(fieldValue));
      const numValue = parseFloat(value);
      if (isNaN(numField) || isNaN(numValue)) return false;
      return numField < numValue;
    }

    case 'after': {
      const bookDate = new Date(String(fieldValue));
      if (isNaN(bookDate.getTime())) return false;

      // Support relative date keywords
      const threshold = resolveDate(value);
      if (!threshold) return false;
      return bookDate.getTime() > threshold.getTime();
    }

    case 'before': {
      const bookDate = new Date(String(fieldValue));
      if (isNaN(bookDate.getTime())) return false;

      const threshold = resolveDate(value);
      if (!threshold) return false;
      return bookDate.getTime() < threshold.getTime();
    }

    default:
      return false;
  }
}

/**
 * Resolve a date value that may be a relative keyword or an ISO string.
 */
function resolveDate(value: string): Date | null {
  const now = new Date();

  switch (value) {
    case 'last7days': {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return d;
    }
    case 'last30days': {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      return d;
    }
    case 'last90days': {
      const d = new Date(now);
      d.setDate(d.getDate() - 90);
      return d;
    }
    case 'lastYear': {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - 1);
      return d;
    }
    default: {
      // Try to parse as an ISO date
      const parsed = new Date(value);
      return isNaN(parsed.getTime()) ? null : parsed;
    }
  }
}

/** Test whether a book matches all rules of a smart shelf (AND logic) */
export function bookMatchesSmartShelf(book: BookEntry, rules: SmartShelfRule[]): boolean {
  if (rules.length === 0) return true;
  return rules.every((rule) => bookMatchesRule(book, rule));
}

/** Get all books matching a smart shelf */
export function getBooksForSmartShelf(books: BookEntry[], shelf: SmartShelf): BookEntry[] {
  return books.filter((book) => bookMatchesSmartShelf(book, shelf.rules));
}

/** Built-in smart shelf templates */
export const SMART_SHELF_TEMPLATES: Omit<SmartShelf, 'id'>[] = [
  {
    name: 'Currently Reading',
    color: '#a855f7',
    rules: [{ field: 'status', operator: 'equals', value: 'reading' }],
  },
  {
    name: 'Long Reads (400+ pages)',
    color: '#f59e0b',
    rules: [{ field: 'pageCount', operator: 'greaterThan', value: '400' }],
  },
  {
    name: 'Added This Month',
    color: '#06b6d4',
    rules: [{ field: 'dateAdded', operator: 'after', value: 'last30days' }],
  },
  {
    name: 'Unfinished',
    color: '#ef4444',
    rules: [{ field: 'status', operator: 'equals', value: 'dnf' }],
  },
];
