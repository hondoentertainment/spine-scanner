import type { BookEntry } from '../types.ts';

/**
 * Detects series information from a book's title and/or subtitle.
 *
 * Handles patterns such as:
 *   "The Name of the Wind (Kingkiller Chronicle, #1)"
 *   "Dune: Book 1" / "Dune: Part 1"
 *   "Harry Potter and the Sorcerer's Stone (Book 1)"
 *   "The Fellowship of the Ring: Being the First Part of The Lord of the Rings"
 *   subtitle = "Book 2 of the Mistborn series"
 */
export function detectSeries(
    title: string,
    subtitle?: string,
): { series: string; seriesNumber: number } | null {
    // Pattern 1: "Title (Series Name, #N)" — most common Google Books format
    const parenSeriesNum = /\(([^)]+),\s*#(\d+(?:\.\d+)?)\)/i;
    const m1 = title.match(parenSeriesNum);
    if (m1) {
        const series = m1[1].trim();
        const seriesNumber = parseFloat(m1[2]);
        if (series && !isNaN(seriesNumber)) {
            return { series, seriesNumber };
        }
    }

    // Pattern 2: "Title (Book N)" — e.g. "Harry Potter and the Sorcerer's Stone (Book 1)"
    const parenBookNum = /\(Book\s+(\d+)\)/i;
    const m2 = title.match(parenBookNum);
    if (m2) {
        // Strip the parenthesised part to get the series name heuristic
        const seriesNumber = parseInt(m2[1], 10);
        // Try to derive series name: everything before the first colon or comma,
        // then strip common leading articles for a cleaner name.
        const baseName = title.replace(/\s*\(Book\s+\d+\)/i, '').trim();
        const series = deriveSeriesName(baseName);
        if (series && !isNaN(seriesNumber)) {
            return { series, seriesNumber };
        }
    }

    // Pattern 3: "Title: Book N" / "Title: Part N"
    const colonBookPart = /:\s*(?:Book|Part)\s+(\d+)\s*$/i;
    const m3 = title.match(colonBookPart);
    if (m3) {
        const seriesNumber = parseInt(m3[1], 10);
        const series = title.replace(colonBookPart, '').trim();
        if (series && !isNaN(seriesNumber)) {
            return { series, seriesNumber };
        }
    }

    // Pattern 4: "...: Being the [Nth] Part of [Series]"
    // e.g. "The Fellowship of the Ring: Being the First Part of The Lord of the Rings"
    const beingPartOf = /:\s*Being\s+the\s+\w+\s+Part\s+of\s+(.+)$/i;
    const m4 = title.match(beingPartOf);
    if (m4) {
        const series = m4[1].trim();
        // Determine ordinal → number mapping
        const ordinalMap: Record<string, number> = {
            first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
            sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
        };
        const ordinalMatch = title.match(/Being\s+the\s+(\w+)\s+Part/i);
        const ordinalWord = ordinalMatch ? ordinalMatch[1].toLowerCase() : '';
        const seriesNumber = ordinalMap[ordinalWord] ?? 1;
        if (series) {
            return { series, seriesNumber };
        }
    }

    // Pattern 5: Subtitle patterns — "Book N of the [Series] series" / "N of [Series]"
    if (subtitle) {
        const subBookOf = /Book\s+(\d+)\s+of\s+(?:the\s+)?(.+?)(?:\s+series)?\s*$/i;
        const m5 = subtitle.match(subBookOf);
        if (m5) {
            const seriesNumber = parseInt(m5[1], 10);
            const series = m5[2].trim();
            if (series && !isNaN(seriesNumber)) {
                return { series, seriesNumber };
            }
        }

        // "Part N of the [Series] series"
        const subPartOf = /Part\s+(\d+)\s+of\s+(?:the\s+)?(.+?)(?:\s+series)?\s*$/i;
        const m5b = subtitle.match(subPartOf);
        if (m5b) {
            const seriesNumber = parseInt(m5b[1], 10);
            const series = m5b[2].trim();
            if (series && !isNaN(seriesNumber)) {
                return { series, seriesNumber };
            }
        }
    }

    return null;
}

/**
 * Strips trailing subtitle fragments and leading "The/A/An" to produce a
 * clean series name from a bare book title. Used as a heuristic when the
 * series name is not explicitly stated in the title pattern.
 */
function deriveSeriesName(title: string): string {
    // Take only the part before the first colon (subtitle separator)
    const beforeColon = title.split(':')[0].trim();
    return beforeColon;
}

/**
 * Returns all books in the library that belong to the given series,
 * sorted ascending by seriesNumber.
 */
export function getSeriesBooks(books: BookEntry[], series: string): BookEntry[] {
    return books
        .filter((b) => b.series?.toLowerCase() === series.toLowerCase())
        .sort((a, b) => (a.seriesNumber ?? 0) - (b.seriesNumber ?? 0));
}
