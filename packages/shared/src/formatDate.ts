const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Calendar day in the viewer's timezone, YYYY-MM-DD. */
export function localDateKey(date: Date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Date-only strings are calendar days, not UTC instants.
 * Full timestamps are real moments and convert to the local calendar.
 */
export function parseDisplayDate(value: string | Date): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const day = DATE_ONLY.exec(trimmed);
  if (day) {
    const parsed = new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
};

const DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  ...DATE_OPTIONS,
  hour: 'numeric',
  minute: '2-digit',
};

/** One locale formatter for dates shown in the app. */
export function formatLocaleDate(
  value: string | Date | null | undefined,
  options: Intl.DateTimeFormatOptions = DATE_OPTIONS,
): string {
  if (value == null || value === '') return '';
  const date = parseDisplayDate(value);
  if (!date) return '';
  return date.toLocaleDateString(undefined, options);
}

export function formatLocaleDateTime(value: string | Date | null | undefined): string {
  if (value == null || value === '') return '';
  const date = parseDisplayDate(value);
  if (!date) return '';
  return date.toLocaleString(undefined, DATE_TIME_OPTIONS);
}
