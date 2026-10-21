import type { BookEntry } from '../types.ts';

export interface PhysicalLocation {
  locationRoom: string;
  locationCase: string;
  locationShelf: string;
}

export interface LocationChoice {
  /** Stored value. Empty string means the field was left blank. */
  value: string;
  label: string;
}

export interface ShelfBookRef {
  id: string;
  title: string;
  author: string;
}

export interface PhysicalShelfNode {
  locationRoom: string;
  locationCase: string;
  locationShelf: string;
  label: string;
  count: number;
  books: ShelfBookRef[];
}

export interface PhysicalCaseNode {
  locationCase: string;
  label: string;
  count: number;
  shelves: PhysicalShelfNode[];
}

export interface PhysicalRoomNode {
  locationRoom: string;
  label: string;
  count: number;
  cases: PhysicalCaseNode[];
}

export function cleanLocation(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizePhysicalLocation(
  book: Partial<Pick<BookEntry, 'locationRoom' | 'locationCase' | 'locationShelf'>>,
): PhysicalLocation {
  return {
    locationRoom: cleanLocation(book.locationRoom),
    locationCase: cleanLocation(book.locationCase),
    locationShelf: cleanLocation(book.locationShelf),
  };
}

export function hasPhysicalLocation(
  book: Partial<Pick<BookEntry, 'locationRoom' | 'locationCase' | 'locationShelf'>>,
): boolean {
  const location = normalizePhysicalLocation(book);
  return Boolean(location.locationRoom || location.locationCase || location.locationShelf);
}

/** Display label for a shelf number or name. "3" becomes "Shelf 3"; "Shelf A" stays as written. */
export function shelfPlaceLabel(shelf: string): string {
  const trimmed = cleanLocation(shelf);
  if (!trimmed) return '';
  return /^shelf\b/i.test(trimmed) ? trimmed : `Shelf ${trimmed}`;
}

export function formatPhysicalLocation(
  book: Partial<Pick<BookEntry, 'locationRoom' | 'locationCase' | 'locationShelf'>>,
): string {
  const location = normalizePhysicalLocation(book);
  return [
    location.locationRoom,
    location.locationCase,
    shelfPlaceLabel(location.locationShelf),
  ].filter(Boolean).join(' · ');
}

export function matchesPhysicalLocation(
  book: BookEntry,
  filter: {
    locationRoom?: string | null;
    locationCase?: string | null;
    locationShelf?: string | null;
  },
): boolean {
  const location = normalizePhysicalLocation(book);
  if (filter.locationRoom != null && !samePlace(location.locationRoom, filter.locationRoom)) return false;
  if (filter.locationCase != null && !samePlace(location.locationCase, filter.locationCase)) return false;
  if (filter.locationShelf != null && !samePlace(location.locationShelf, filter.locationShelf)) return false;
  return true;
}

export function locationFilterChoices(
  books: BookEntry[],
  field: 'locationRoom' | 'locationCase' | 'locationShelf',
  scope: { locationRoom?: string | null; locationCase?: string | null } = {},
): LocationChoice[] {
  const emptyLabel = field === 'locationRoom'
    ? 'No room'
    : field === 'locationCase'
      ? 'No case'
      : 'No shelf label';
  let sawEmpty = false;
  const values: string[] = [];

  for (const book of books) {
    if (!bookInLocationScope(book, scope)) continue;
    const value = cleanLocation(book[field]);
    if (!value) {
      if (hasPhysicalLocation(book)) sawEmpty = true;
      continue;
    }
    values.push(value);
  }

  const choices = uniqueSorted(values).map((value) => ({
    value,
    label: field === 'locationShelf' ? shelfPlaceLabel(value) : value,
  }));
  if (sawEmpty) choices.push({ value: '', label: emptyLabel });
  return choices;
}

export function choiceStillValid(choices: LocationChoice[], filter: string | null): boolean {
  if (filter == null) return true;
  return choices.some((choice) => samePlace(choice.value, filter));
}

export function buildPhysicalShelfMap(books: BookEntry[]): PhysicalRoomNode[] {
  const rooms = new Map<string, BookEntry[]>();
  for (const book of books) {
    if (!hasPhysicalLocation(book)) continue;
    const room = cleanLocation(book.locationRoom);
    const list = rooms.get(room) ?? [];
    list.push(book);
    rooms.set(room, list);
  }

  const roomNodes: PhysicalRoomNode[] = [];
  for (const [room, roomBooks] of rooms) {
    const cases = new Map<string, BookEntry[]>();
    for (const book of roomBooks) {
      const bookcase = cleanLocation(book.locationCase);
      const list = cases.get(bookcase) ?? [];
      list.push(book);
      cases.set(bookcase, list);
    }

    const caseNodes: PhysicalCaseNode[] = [];
    for (const [bookcase, caseBooks] of cases) {
      const shelves = new Map<string, BookEntry[]>();
      for (const book of caseBooks) {
        const shelf = cleanLocation(book.locationShelf);
        const list = shelves.get(shelf) ?? [];
        list.push(book);
        shelves.set(shelf, list);
      }
      const shelfNodes = [...shelves.entries()]
        .map(([locationShelf, shelfBooks]) => ({
          locationRoom: room,
          locationCase: bookcase,
          locationShelf,
          label: locationShelf ? shelfPlaceLabel(locationShelf) : 'No shelf label',
          count: shelfBooks.length,
          books: shelfBooks
            .map((book) => ({ id: book.id, title: book.title, author: book.author }))
            .sort((a, b) => a.title.localeCompare(b.title)),
        }))
        .sort((a, b) => comparePlace(a.locationShelf, b.locationShelf));
      caseNodes.push({
        locationCase: bookcase,
        label: bookcase || 'No case',
        count: caseBooks.length,
        shelves: shelfNodes,
      });
    }
    caseNodes.sort((a, b) => comparePlace(a.locationCase, b.locationCase));
    roomNodes.push({
      locationRoom: room,
      label: room || 'No room',
      count: roomBooks.length,
      cases: caseNodes,
    });
  }

  roomNodes.sort((a, b) => comparePlace(a.locationRoom, b.locationRoom));
  return roomNodes;
}

function samePlace(actual: string, expected: string): boolean {
  return cleanLocation(actual).toLowerCase() === expected.trim().toLowerCase();
}

function bookInLocationScope(
  book: BookEntry,
  scope: { locationRoom?: string | null; locationCase?: string | null },
): boolean {
  if (scope.locationRoom != null && !samePlace(cleanLocation(book.locationRoom), scope.locationRoom)) return false;
  if (scope.locationCase != null && !samePlace(cleanLocation(book.locationCase), scope.locationCase)) return false;
  return true;
}

function uniqueSorted(values: string[]): string[] {
  const seen = new Map<string, string>();
  for (const value of values) {
    const trimmed = cleanLocation(value);
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) seen.set(key, trimmed);
  }
  return [...seen.values()].sort(comparePlace);
}

function comparePlace(a: string, b: string): number {
  if (!a && b) return 1;
  if (a && !b) return -1;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}
