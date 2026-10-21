/** "1 book" / "2 books". Pass an irregular plural when adding "s" is wrong. */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  const safe = Number.isFinite(count) ? Math.abs(Math.trunc(count)) : 0;
  return `${safe.toLocaleString()} ${safe === 1 ? singular : plural}`;
}
