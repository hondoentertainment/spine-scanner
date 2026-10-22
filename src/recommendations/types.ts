export type RecommendationProvider = 'google_books' | 'open_library' | 'llm';

/** A title returned by Google Books, Open Library, or the optional suggestions endpoint. */
export interface CatalogCandidate {
  title: string;
  author: string;
  /** Preferred ISBN, ISBN-13 when one is available. */
  isbn: string;
  /** Every normalized ISBN the provider returned. */
  isbns: string[];
  pageCount: number;
  coverImg: string;
  subjects: string[];
  seriesName?: string;
  /** Open Library work id, such as OL1168083W, when the provider sent one. */
  workKey?: string;
  /** Provider language code (eng, en, fr, …). Empty when unknown. */
  language?: string;
  /** Other titles for the same work, such as a spelled-out year. */
  alternateTitles?: string[];
  source: RecommendationProvider;
  /** Used only when a provider already explained the pick with owned titles. */
  reason?: string;
}

/** One book already on the shelf, plus subjects looked up for matching. */
export interface OwnedBookSignal {
  id: string;
  title: string;
  author: string;
  isbn: string;
  seriesName?: string;
  subjects: string[];
  isPhotoOnly?: boolean;
  workKey?: string;
  alternateTitles?: string[];
}

export interface BookRecommendation {
  id: string;
  title: string;
  author: string;
  isbn: string;
  isbns: string[];
  pageCount: number;
  coverImg: string;
  seriesName?: string;
  workKey?: string;
  language?: string;
  alternateTitles?: string[];
  reason: string;
  /** Shelf titles named in `reason`. The card is dropped if none of these remain. */
  becauseTitles: string[];
  source: RecommendationProvider;
}

export type RecommendationOrigin = 'network' | 'cache' | 'empty' | 'offline' | 'error';

export interface RecommendationResult {
  recommendations: BookRecommendation[];
  origin: RecommendationOrigin;
  notice: string;
}
