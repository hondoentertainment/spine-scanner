import type { BookEntry, SmartShelf, SmartShelfRule } from '../types.ts';

function evaluateRule(book: BookEntry, rule: SmartShelfRule): boolean {
  const { field, op, value } = rule;
  switch (field) {
    case 'status':
      return op === 'eq' ? book.status === value : book.status !== value;

    case 'title': {
      const inTitle = book.title.toLowerCase().includes(value.toLowerCase());
      return op === 'contains' ? inTitle : !inTitle;
    }

    case 'author': {
      const inAuthor = book.author.toLowerCase().includes(value.toLowerCase());
      return op === 'contains' ? inAuthor : !inAuthor;
    }

    case 'pageCount': {
      const n = parseInt(value, 10);
      if (isNaN(n)) return false;
      const pages = book.pageCount || 0;
      return op === 'gt' ? pages > n : pages < n;
    }

    case 'dateAdded': {
      if (op !== 'within_days') return false;
      const days = parseInt(value, 10);
      if (isNaN(days)) return false;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      return new Date(book.dateAdded) >= cutoff;
    }

    case 'hasProgress': {
      const hasProgress = (book.progressPages ?? 0) > 0;
      return op === 'eq' ? hasProgress === (value === 'true') : hasProgress !== (value === 'true');
    }

    default:
      return false;
  }
}

export function matchesSmartShelf(book: BookEntry, shelf: SmartShelf): boolean {
  if (shelf.rules.length === 0) return false;
  return shelf.match === 'all'
    ? shelf.rules.every((r) => evaluateRule(book, r))
    : shelf.rules.some((r) => evaluateRule(book, r));
}

export function countSmartShelfMatches(books: BookEntry[], shelf: SmartShelf): number {
  return books.filter((b) => matchesSmartShelf(b, shelf)).length;
}
