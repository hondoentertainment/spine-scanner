import { describe, it, expect } from 'vitest';
import { batchAddToastMessage, batchSummaryMessage } from '../batchSession';

describe('batchAddToastMessage', () => {
  it('keeps the simple prompt for the first add', () => {
    expect(batchAddToastMessage(1)).toBe('Added. Ready for the next book.');
  });

  it('shows the running session count from the second add on', () => {
    expect(batchAddToastMessage(2)).toBe('Added — 2 books this session.');
    expect(batchAddToastMessage(7)).toBe('Added — 7 books this session.');
  });
});

describe('batchSummaryMessage', () => {
  it('pluralizes correctly', () => {
    expect(batchSummaryMessage(1)).toBe('Batch complete — you added 1 book this session.');
    expect(batchSummaryMessage(4)).toBe('Batch complete — you added 4 books this session.');
  });
});
