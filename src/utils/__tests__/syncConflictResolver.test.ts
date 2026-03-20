import { describe, it, expect } from 'vitest';
import {
  detectConflicts,
  resolveConflicts,
  autoResolveConflicts,
} from '../syncConflictResolver';
import type { BookEntry } from '../../types';

function makeBook(overrides: Partial<BookEntry> = {}): BookEntry {
  return {
    id: 'book-1',
    isbn: '1234567890',
    title: 'Test Book',
    author: 'Author A',
    pageCount: 200,
    amazonLink: '',
    coverImg: '',
    status: 'to-read',
    notes: '',
    dateAdded: '2025-01-01T00:00:00.000Z',
    shelfIds: [],
    ...overrides,
  };
}

describe('detectConflicts', () => {
  it('returns empty array when books match', () => {
    const local = [makeBook()];
    const remote = [makeBook()];
    expect(detectConflicts(local, remote)).toEqual([]);
  });

  it('returns empty array when there are no common books', () => {
    const local = [makeBook({ id: 'a' })];
    const remote = [makeBook({ id: 'b' })];
    expect(detectConflicts(local, remote)).toEqual([]);
  });

  it('detects title conflict', () => {
    const local = [makeBook({ title: 'Local Title' })];
    const remote = [makeBook({ title: 'Remote Title' })];
    const conflicts = detectConflicts(local, remote);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].field).toBe('title');
    expect(conflicts[0].localValue).toBe('Local Title');
    expect(conflicts[0].remoteValue).toBe('Remote Title');
    expect(conflicts[0].bookId).toBe('book-1');
  });

  it('detects multiple field conflicts on the same book', () => {
    const local = [makeBook({ title: 'A', author: 'X', notes: 'local note' })];
    const remote = [makeBook({ title: 'B', author: 'Y', notes: 'remote note' })];
    const conflicts = detectConflicts(local, remote);
    expect(conflicts).toHaveLength(3);
    const fields = conflicts.map((c) => c.field);
    expect(fields).toContain('title');
    expect(fields).toContain('author');
    expect(fields).toContain('notes');
  });

  it('detects conflicts across multiple books', () => {
    const local = [
      makeBook({ id: 'b1', title: 'Local1' }),
      makeBook({ id: 'b2', author: 'LocalAuthor' }),
    ];
    const remote = [
      makeBook({ id: 'b1', title: 'Remote1' }),
      makeBook({ id: 'b2', author: 'RemoteAuthor' }),
    ];
    const conflicts = detectConflicts(local, remote);
    expect(conflicts).toHaveLength(2);
  });

  it('detects numeric field conflicts (pageCount)', () => {
    const local = [makeBook({ pageCount: 100 })];
    const remote = [makeBook({ pageCount: 200 })];
    const conflicts = detectConflicts(local, remote);
    expect(conflicts.some((c) => c.field === 'pageCount')).toBe(true);
  });

  it('handles undefined vs defined optional fields', () => {
    const local = [makeBook({ rating: undefined })];
    const remote = [makeBook({ rating: 5 })];
    const conflicts = detectConflicts(local, remote);
    expect(conflicts.some((c) => c.field === 'rating')).toBe(true);
  });
});

describe('resolveConflicts', () => {
  it('applies local resolution', () => {
    const local = [makeBook({ title: 'Local Title' })];
    const remote = [makeBook({ title: 'Remote Title' })];
    const conflicts = detectConflicts(local, remote);
    const resolved = conflicts.map((c) => ({
      ...c,
      resolution: 'local' as const,
      resolvedValue: c.localValue,
    }));
    const result = resolveConflicts(local, remote, resolved);
    expect(result[0].title).toBe('Local Title');
  });

  it('applies remote resolution', () => {
    const local = [makeBook({ title: 'Local Title' })];
    const remote = [makeBook({ title: 'Remote Title' })];
    const conflicts = detectConflicts(local, remote);
    const resolved = conflicts.map((c) => ({
      ...c,
      resolution: 'remote' as const,
      resolvedValue: c.remoteValue,
    }));
    const result = resolveConflicts(local, remote, resolved);
    expect(result[0].title).toBe('Remote Title');
  });

  it('applies manual resolution', () => {
    const local = [makeBook({ title: 'Local' })];
    const remote = [makeBook({ title: 'Remote' })];
    const conflicts = detectConflicts(local, remote);
    const resolved = conflicts.map((c) => ({
      ...c,
      resolution: 'manual' as const,
      resolvedValue: 'Custom Title',
    }));
    const result = resolveConflicts(local, remote, resolved);
    expect(result[0].title).toBe('Custom Title');
  });

  it('includes remote-only books in result', () => {
    const local = [makeBook({ id: 'a', title: 'A' })];
    const remote = [
      makeBook({ id: 'a', title: 'A' }),
      makeBook({ id: 'b', title: 'B' }),
    ];
    const result = resolveConflicts(local, remote, []);
    expect(result).toHaveLength(2);
    expect(result.some((b) => b.id === 'b')).toBe(true);
  });

  it('returns sorted by dateAdded descending', () => {
    const local = [
      makeBook({ id: 'old', dateAdded: '2024-01-01T00:00:00.000Z' }),
      makeBook({ id: 'new', dateAdded: '2025-06-01T00:00:00.000Z' }),
    ];
    const result = resolveConflicts(local, [], []);
    expect(result[0].id).toBe('new');
    expect(result[1].id).toBe('old');
  });
});

describe('autoResolveConflicts', () => {
  it('resolves user-edit fields as local', () => {
    const conflicts = [
      {
        id: 'c1',
        bookId: 'book-1',
        field: 'title',
        localValue: 'Local',
        remoteValue: 'Remote',
      },
      {
        id: 'c2',
        bookId: 'book-1',
        field: 'notes',
        localValue: 'My notes',
        remoteValue: 'Other notes',
      },
    ];
    const result = autoResolveConflicts(conflicts);
    expect(result[0].resolution).toBe('local');
    expect(result[0].resolvedValue).toBe('Local');
    expect(result[1].resolution).toBe('local');
    expect(result[1].resolvedValue).toBe('My notes');
  });

  it('resolves non-user-edit fields as remote', () => {
    const conflicts = [
      {
        id: 'c1',
        bookId: 'book-1',
        field: 'coverImg',
        localValue: 'local.jpg',
        remoteValue: 'remote.jpg',
      },
      {
        id: 'c2',
        bookId: 'book-1',
        field: 'amazonLink',
        localValue: 'local-link',
        remoteValue: 'remote-link',
      },
    ];
    const result = autoResolveConflicts(conflicts);
    expect(result[0].resolution).toBe('remote');
    expect(result[0].resolvedValue).toBe('remote.jpg');
    expect(result[1].resolution).toBe('remote');
  });

  it('respects userEditedFields from the book', () => {
    const localBooks = [
      makeBook({
        id: 'book-1',
        userEditedFields: ['coverImg'],
      }),
    ];
    const conflicts = [
      {
        id: 'c1',
        bookId: 'book-1',
        field: 'coverImg',
        localValue: 'custom.jpg',
        remoteValue: 'api.jpg',
      },
    ];
    const result = autoResolveConflicts(conflicts, localBooks);
    // coverImg is not in USER_EDIT_FIELDS but is in userEditedFields
    expect(result[0].resolution).toBe('local');
    expect(result[0].resolvedValue).toBe('custom.jpg');
  });

  it('returns empty array when no conflicts', () => {
    expect(autoResolveConflicts([])).toEqual([]);
  });
});
