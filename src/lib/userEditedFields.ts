import type { BookEntry, UserEditedFields } from '../types.ts';

/** Unified view of manual-edit flags (supports legacy `metadataUserEdited`). */
export function getUserEditedFields(book: BookEntry): UserEditedFields {
  return { ...(book.metadataUserEdited ?? {}), ...(book.userEditedFields ?? {}) };
}

export function withUserEditedFields(
  _book: BookEntry,
  fields: UserEditedFields | undefined,
): Pick<BookEntry, 'userEditedFields' | 'metadataUserEdited'> {
  if (!fields || Object.keys(fields).length === 0) {
    return { userEditedFields: undefined, metadataUserEdited: undefined };
  }
  return { userEditedFields: fields, metadataUserEdited: fields };
}
