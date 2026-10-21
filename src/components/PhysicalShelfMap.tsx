import React from 'react';
import { MapPin } from 'lucide-react';
import type { BookEntry } from '../types.ts';
import { buildPhysicalShelfMap } from '../utils/physicalLocation.ts';
import s from './PhysicalShelfMap.module.css';

export interface PhysicalLocationFilter {
  locationRoom: string | null;
  locationCase: string | null;
  locationShelf: string | null;
}

interface PhysicalShelfMapProps {
  books: BookEntry[];
  locationRoom: string | null;
  locationCase: string | null;
  locationShelf: string | null;
  onSelect: (next: PhysicalLocationFilter) => void;
  onOpenBook?: (bookId: string) => void;
}

function pluralLabel(count: number): string {
  return count === 1 ? '1 book' : `${count} books`;
}

function sameFilter(current: PhysicalLocationFilter, next: PhysicalLocationFilter): boolean {
  return current.locationRoom === next.locationRoom
    && current.locationCase === next.locationCase
    && current.locationShelf === next.locationShelf;
}

const PhysicalShelfMap: React.FC<PhysicalShelfMapProps> = ({
  books,
  locationRoom,
  locationCase,
  locationShelf,
  onSelect,
  onOpenBook,
}) => {
  const rooms = buildPhysicalShelfMap(books);
  const current = { locationRoom, locationCase, locationShelf };

  const choose = (next: PhysicalLocationFilter) => {
    onSelect(sameFilter(current, next)
      ? { locationRoom: null, locationCase: null, locationShelf: null }
      : next);
  };

  return (
    <div className={s.container}>
      <div className={s.header}>
        <MapPin size={16} aria-hidden />
        <span className={s.headerText}>Physical shelf map</span>
      </div>
      {rooms.length === 0 ? (
        <p className={s.empty}>
          No physical locations yet. Edit a book, or select several and apply a room, case, and shelf.
        </p>
      ) : (
        <div className={s.rooms} aria-label="Physical shelf map">
          {rooms.map((room) => {
            const roomFilter = {
              locationRoom: room.locationRoom,
              locationCase: null,
              locationShelf: null,
            };
            return (
              <section key={room.locationRoom || '__room'} className={s.room}>
                <button
                  type="button"
                  className={`glass ${s.placeBtn} ${sameFilter(current, roomFilter) ? s.placeBtnActive : ''}`}
                  aria-pressed={sameFilter(current, roomFilter)}
                  onClick={() => choose(roomFilter)}
                >
                  {room.label}
                  <span className={s.count}>{pluralLabel(room.count)}</span>
                </button>
                {room.cases.map((bookcase) => {
                  const caseFilter = {
                    locationRoom: room.locationRoom,
                    locationCase: bookcase.locationCase,
                    locationShelf: null,
                  };
                  return (
                    <div key={`${room.locationRoom}::${bookcase.locationCase}`} className={s.caseBlock}>
                      <button
                        type="button"
                        className={`glass ${s.placeBtn} ${s.caseBtn} ${sameFilter(current, caseFilter) ? s.placeBtnActive : ''}`}
                        aria-pressed={sameFilter(current, caseFilter)}
                        onClick={() => choose(caseFilter)}
                      >
                        {bookcase.label}
                        <span className={s.count}>{pluralLabel(bookcase.count)}</span>
                      </button>
                      <div className={s.shelfStack}>
                        {bookcase.shelves.map((shelf) => {
                          const shelfFilter = {
                            locationRoom: room.locationRoom,
                            locationCase: bookcase.locationCase,
                            locationShelf: shelf.locationShelf,
                          };
                          return (
                            <div key={`${room.locationRoom}::${bookcase.locationCase}::${shelf.locationShelf}`} className={s.shelfBlock}>
                              <button
                                type="button"
                                className={`glass ${s.placeBtn} ${s.shelfBtn} ${sameFilter(current, shelfFilter) ? s.placeBtnActive : ''}`}
                                aria-pressed={sameFilter(current, shelfFilter)}
                                onClick={() => choose(shelfFilter)}
                              >
                                {shelf.label}
                                <span className={s.count}>{pluralLabel(shelf.count)}</span>
                              </button>
                              <ul className={s.bookList}>
                                {shelf.books.map((book) => (
                                  <li key={book.id}>
                                    <button
                                      type="button"
                                      className={s.bookBtn}
                                      onClick={() => onOpenBook?.(book.id)}
                                    >
                                      <span className={s.bookTitle}>{book.title}</span>
                                      <span className={s.bookAuthor}>{book.author}</span>
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PhysicalShelfMap;
