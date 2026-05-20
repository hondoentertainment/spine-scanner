import { describe, expect, it } from 'vitest';
import { mergeMetadataUserEditedAfterSave } from '../mergeMetadataUserEditedAfterSave.ts';

describe('mergeMetadataUserEditedAfterSave', () => {
  const base = { title: 'A', author: 'B', pageCount: 100, coverImg: 'http://x' };

  it('marks fields that changed from baseline', () => {
    const out = mergeMetadataUserEditedAfterSave(undefined, base, {
      title: 'A2',
      author: 'B',
      pageCount: 100,
      coverImg: 'http://x',
    });
    expect(out.title).toBe(true);
    expect(out.author).toBeUndefined();
  });

  it('preserves prior flags and adds new ones', () => {
    const out = mergeMetadataUserEditedAfterSave({ author: true }, base, {
      title: 'A',
      author: 'B',
      pageCount: 200,
      coverImg: 'http://y',
    });
    expect(out.author).toBe(true);
    expect(out.pageCount).toBe(true);
    expect(out.coverImg).toBe(true);
  });
});
