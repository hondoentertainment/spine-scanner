import { describe, it, expect, vi } from 'vitest';
import { importFromStoryGraphCSV } from '../importLogic';
import type { BookEntry } from '../../types';

const STORYGRAPH_HEADER =
    'Title,Authors,ISBN/UID,Format,Type,Read Status,Star Rating,Review,Read Count,Dates Read,Edition Language,Average Rating,Genres,Moods,Pace,Characters,Series,Page Count,Publication Information,Tags,Owned Copies';

function makeCSV(...rows: string[]): string {
    return [STORYGRAPH_HEADER, ...rows].join('\n');
}

function makeAddBook() {
    const added: BookEntry[] = [];
    const fn = vi.fn((book: BookEntry) => { added.push(book); });
    return { fn, added };
}

describe('importFromStoryGraphCSV', () => {
    it('parses a standard StoryGraph export row', () => {
        const csv = makeCSV(
            '"The Name of the Wind","Patrick Rothfuss","9780756404079",physical,fiction,read,4.5,,1,"2023-04-15|2023-05-02",English,4.21,"Fantasy|High Fantasy","","slow","",Kingkiller Chronicle #1,662,"","",0',
        );
        const { fn, added } = makeAddBook();
        const result = importFromStoryGraphCSV(csv, [], fn);

        expect(result.added).toBe(1);
        expect(result.duplicates).toBe(0);
        expect(result.errors).toHaveLength(0);

        const book = added[0];
        expect(book.title).toBe('The Name of the Wind');
        expect(book.author).toBe('Patrick Rothfuss');
        expect(book.isbn).toBe('9780756404079');
        expect(book.pageCount).toBe(662);
        expect(book.metadataSource).toBe('manual');
    });

    it('maps all four read status variants correctly', () => {
        const csv = makeCSV(
            '"Book A","Author A","111",physical,fiction,read,,,0,"",English,4.0,"","","","","",100,"","",0',
            '"Book B","Author B","222",physical,fiction,currently-reading,,,0,"",English,4.0,"","","","","",200,"","",0',
            '"Book C","Author C","333",physical,fiction,did-not-finish,,,0,"",English,4.0,"","","","","",300,"","",0',
            '"Book D","Author D","444",physical,fiction,to-read,,,0,"",English,4.0,"","","","","",400,"","",0',
            '"Book E","Author E","555",physical,fiction,unknown-status,,,0,"",English,4.0,"","","","","",150,"","",0',
        );
        const { fn, added } = makeAddBook();
        importFromStoryGraphCSV(csv, [], fn);

        expect(added[0].status).toBe('read');
        expect(added[1].status).toBe('reading');
        expect(added[2].status).toBe('dnf');
        expect(added[3].status).toBe('to-read');
        expect(added[4].status).toBe('to-read');
    });

    it('extracts startedAt and finishedAt from Dates Read', () => {
        const csv = makeCSV(
            '"Test Book","Author","9780000000001",physical,fiction,read,,,1,"2023-01-10|2023-02-15",English,4.0,"","","","","",300,"","",0',
        );
        const { fn, added } = makeAddBook();
        importFromStoryGraphCSV(csv, [], fn);

        const book = added[0];
        expect(book.startedAt).toBeTruthy();
        expect(book.finishedAt).toBeTruthy();
        // Should be ISO strings containing the parsed dates
        expect(book.startedAt).toContain('2023-01-10');
        expect(book.finishedAt).toContain('2023-02-15');
    });

    it('handles single date in Dates Read (no finishedAt)', () => {
        const csv = makeCSV(
            '"Solo Date","Author","9780000000002",physical,fiction,currently-reading,,,0,"2024-03-01",English,4.0,"","","","","",250,"","",0',
        );
        const { fn, added } = makeAddBook();
        importFromStoryGraphCSV(csv, [], fn);

        const book = added[0];
        expect(book.startedAt).toContain('2024-03-01');
        expect(book.finishedAt).toBeNull();
    });

    it('extracts seriesName from Series column', () => {
        const csv = makeCSV(
            '"The Name of the Wind","Patrick Rothfuss","9780756404079",physical,fiction,read,4.5,,1,"",English,4.21,"","","","",Kingkiller Chronicle #1,662,"","",0',
        );
        const { fn, added } = makeAddBook();
        importFromStoryGraphCSV(csv, [], fn);

        expect(added[0].seriesName).toBe('Kingkiller Chronicle #1');
    });

    it('sets seriesName to undefined when Series column is empty', () => {
        const csv = makeCSV(
            '"Standalone","Author","9780000000099",physical,fiction,read,,,1,"",English,4.0,"","","","","",200,"","",0',
        );
        const { fn, added } = makeAddBook();
        importFromStoryGraphCSV(csv, [], fn);

        expect(added[0].seriesName).toBeUndefined();
    });

    it('skips duplicates by ISBN', () => {
        const existingBook: BookEntry = {
            id: 'existing-1',
            isbn: '9780756404079',
            title: 'Different Title',
            author: 'Different Author',
            pageCount: 0,
            amazonLink: '',
            coverImg: '',
            status: 'read',
            notes: '',
            dateAdded: new Date().toISOString(),
            shelfIds: [],
        };
        const csv = makeCSV(
            '"The Name of the Wind","Patrick Rothfuss","9780756404079",physical,fiction,read,4.5,,1,"",English,4.21,"","","","","",662,"","",0',
        );
        const { fn } = makeAddBook();
        const result = importFromStoryGraphCSV(csv, [existingBook], fn);

        expect(result.added).toBe(0);
        expect(result.duplicates).toBe(1);
        expect(fn).not.toHaveBeenCalled();
    });

    it('skips duplicates by normalized title+author', () => {
        const existingBook: BookEntry = {
            id: 'existing-2',
            isbn: '', // no ISBN so ISBN check won't match
            title: 'Project Hail Mary',
            author: 'Andy Weir',
            pageCount: 480,
            amazonLink: '',
            coverImg: '',
            status: 'to-read',
            notes: '',
            dateAdded: new Date().toISOString(),
            shelfIds: [],
        };
        const csv = makeCSV(
            '"Project Hail Mary","Andy Weir","",physical,fiction,read,,,1,"",English,3.98,"","","","","",480,"","",0',
        );
        const { fn } = makeAddBook();
        const result = importFromStoryGraphCSV(csv, [existingBook], fn);

        expect(result.added).toBe(0);
        expect(result.duplicates).toBe(1);
        expect(fn).not.toHaveBeenCalled();
    });

    it('skips rows with no title', () => {
        const csv = makeCSV(
            '"","Author","9780000000010",physical,fiction,read,,,0,"",English,4.0,"","","","","",100,"","",0',
            '"Valid Title","Author","9780000000011",physical,fiction,read,,,0,"",English,4.0,"","","","","",100,"","",0',
        );
        const { fn, added } = makeAddBook();
        const result = importFromStoryGraphCSV(csv, [], fn);

        expect(result.added).toBe(1);
        expect(added[0].title).toBe('Valid Title');
    });

    it('handles missing optional fields gracefully', () => {
        const csv = makeCSV(
            '"Minimal Book","","",,,,,,,,,,,,,,,,,',
        );
        const { fn, added } = makeAddBook();
        const result = importFromStoryGraphCSV(csv, [], fn);

        expect(result.added).toBe(1);
        const book = added[0];
        expect(book.title).toBe('Minimal Book');
        expect(book.isbn).toBe('');
        expect(book.pageCount).toBe(0);
        expect(book.startedAt).toBeNull();
        expect(book.finishedAt).toBeNull();
        expect(book.seriesName).toBeUndefined();
    });

    it('returns empty result for CSV with only a header', () => {
        const { fn } = makeAddBook();
        const result = importFromStoryGraphCSV(STORYGRAPH_HEADER, [], fn);
        expect(result.added).toBe(0);
        expect(result.duplicates).toBe(0);
        expect(fn).not.toHaveBeenCalled();
    });

    it('sets dateAdded and metadataSource correctly', () => {
        const csv = makeCSV(
            '"A Book","An Author","9780000000020",physical,fiction,read,,,1,"",English,4.0,"","","","","",100,"","",0',
        );
        const { fn, added } = makeAddBook();
        importFromStoryGraphCSV(csv, [], fn);

        expect(added[0].metadataSource).toBe('manual');
        expect(() => new Date(added[0].dateAdded)).not.toThrow();
    });

    it('generates a unique id for each book', () => {
        const csv = makeCSV(
            '"Book One","Author A","9780000000030",physical,fiction,read,,,0,"",English,4.0,"","","","","",100,"","",0',
            '"Book Two","Author B","9780000000031",physical,fiction,read,,,0,"",English,4.0,"","","","","",200,"","",0',
        );
        const { fn, added } = makeAddBook();
        importFromStoryGraphCSV(csv, [], fn);

        expect(added[0].id).toBeTruthy();
        expect(added[1].id).toBeTruthy();
        expect(added[0].id).not.toBe(added[1].id);
    });
});
