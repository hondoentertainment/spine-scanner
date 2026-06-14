import { describe, it, expect } from 'vitest';
import { getUserEditedFields, withUserEditedFields } from '../userEditedFields.ts';
import type { BookEntry } from '../../types.ts';

const baseBook = (): BookEntry => ({
  id: 'b1',
  isbn: '9780141036144',
  title: 'Title',
  author: 'Author',
  pageCount: 100,
  amazonLink: '',
  coverImg: '',
  status: 'to-read',
  notes: '',
  dateAdded: new Date().toISOString(),
  shelfIds: [],
});

describe('getUserEditedFields', () => {
  it('merges legacy and current edited-field maps', () => {
    const book: BookEntry = {
      ...baseBook(),
      metadataUserEdited: { title: true },
      userEditedFields: { coverImg: true },
    };
    expect(getUserEditedFields(book)).toEqual({ title: true, coverImg: true });
  });
});

describe('withUserEditedFields', () => {
  it('clears both aliases when fields are empty', () => {
    expect(withUserEditedFields(baseBook(), undefined)).toEqual({
      userEditedFields: undefined,
      metadataUserEdited: undefined,
    });
  });

  it('mirrors edited flags to both aliases', () => {
    const fields = { author: true };
    expect(withUserEditedFields(baseBook(), fields)).toEqual({
      userEditedFields: fields,
      metadataUserEdited: fields,
    });
  });
});
