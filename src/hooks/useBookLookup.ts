import { useState } from 'react';

export interface BookMetadata {
    title: string;
    authors: string[];
    pageCount: number;
    thumbnail: string;
    isbn: string;
}

export const useBookLookup = () => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const lookupByIsbn = async (isbn: string): Promise<BookMetadata | null> => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
            const data = await response.json();

            if (data.totalItems === 0) {
                setError('No book found with this ISBN');
                return null;
            }

            const volumeInfo = data.items[0].volumeInfo;
            return {
                title: volumeInfo.title || 'Unknown Title',
                authors: volumeInfo.authors || ['Unknown Author'],
                pageCount: volumeInfo.pageCount || 0,
                thumbnail: volumeInfo.imageLinks?.thumbnail || '',
                isbn,
            };
        } catch (err) {
            setError('Failed to fetch book metadata');
            return null;
        } finally {
            setLoading(false);
        }
    };

    return { lookupByIsbn, loading, error };
};
