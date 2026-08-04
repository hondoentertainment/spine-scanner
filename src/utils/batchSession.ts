/** Toast copy for batch-scan sessions (roadmap B5). */

export function batchAddToastMessage(sessionCount: number): string {
  if (sessionCount <= 1) return 'Added. Ready for the next book.';
  return `Added — ${sessionCount} books this session.`;
}

export function batchSummaryMessage(sessionCount: number): string {
  return `Batch complete — you added ${sessionCount} book${sessionCount === 1 ? '' : 's'} this session.`;
}
