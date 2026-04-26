import type { BookEntry } from '../types.ts';

export type MetadataEditBaseline = {
  title: string;
  author: string;
  pageCount: number;
  coverImg: string;
};

/**
 * When the user saves inline edits, mark fields that diverged from the baseline
 * (values when edit mode opened) so metadata refresh will not overwrite them.
 */
export function mergeMetadataUserEditedAfterSave(
  previous: BookEntry['metadataUserEdited'] | undefined,
  baseline: MetadataEditBaseline,
  draft: MetadataEditBaseline,
): BookEntry['metadataUserEdited'] {
  const nextUserEdited: BookEntry['metadataUserEdited'] = { ...previous };
  if (draft.title.trim() !== baseline.title) nextUserEdited.title = true;
  if (draft.author.trim() !== baseline.author) nextUserEdited.author = true;
  if ((draft.pageCount || 0) !== baseline.pageCount) nextUserEdited.pageCount = true;
  if (draft.coverImg.trim() !== baseline.coverImg) nextUserEdited.coverImg = true;
  return nextUserEdited;
}
