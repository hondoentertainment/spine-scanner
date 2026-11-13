import React, { useState } from 'react';
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

const CLEARED: PhysicalLocationFilter = {
  locationRoom: null,
  locationCase: null,
  locationShelf: null,
};

function roomName(label: string, count: number): string {
  return `Room ${label}, ${pluralLabel(count)}`;
}

function caseName(label: string, roomLabel: string, count: number): string {
  return `Case ${label} in ${roomLabel}, ${pluralLabel(count)}`;
}

function shelfName(label: string, caseLabel: string, roomLabel: string, count: number): string {
  return `${label} in ${caseLabel}, ${roomLabel}, ${pluralLabel(count)}`;
}

/**
 * Arrow keys move through rooms, cases, and shelves in tree order.
 * Tab still visits each place (and each book). Enter and Space activate the
 * focused button, the same way the scanner activates its focused control.
 */
function onMapKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
  const key = event.key;
  const delta = key === 'ArrowDown' || key === 'ArrowRight' ? 1
    : key === 'ArrowUp' || key === 'ArrowLeft' ? -1
    : null;
  const jump = key === 'Home' ? 0 : key === 'End' ? -1 : null;
  if (delta == null && jump == null) return;

  const target = event.target;
  if (!(target instanceof Element)) return;
  const current = target.closest<HTMLButtonElement>('[role="treeitem"]');
  if (!current || !event.currentTarget.contains(current)) return;

  const places = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="treeitem"]')];
  const index = places.indexOf(current);
  if (index < 0) return;

  const nextIndex = jump === 0
    ? 0
    : jump === -1
      ? places.length - 1
      : Math.min(places.length - 1, Math.max(0, index + (delta ?? 0)));

  event.preventDefault();
  places[nextIndex]?.focus();
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
  const [announcement, setAnnouncement] = useState('');

  const choose = (next: PhysicalLocationFilter, name: string) => {
    const clearing = sameFilter(current, next);
    onSelect(clearing ? CLEARED : next);
    setAnnouncement(clearing ? 'Selection cleared' : `${name} selected`);
  };

  return (
    <div className={s.container}>
      <div className={s.header}>
        <MapPin size={16} aria-hidden />
        <span className={s.headerText}>Physical shelf map</span>
      </div>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
      {rooms.length === 0 ? (
        <p className={s.empty}>
          No physical locations yet. Edit a book, or select several and apply a room, case, and shelf.
        </p>
      ) : (
        <div className={s.rooms} role="tree" aria-label="Physical shelf map" onKeyDown={onMapKeyDown}>
          {rooms.map((room) => {
            const roomFilter = {
              locationRoom: room.locationRoom,
              locationCase: null,
              locationShelf: null,
            };
            const roomSelected = sameFilter(current, roomFilter);
            const roomLabel = roomName(room.label, room.count);
            return (
              <div key={room.locationRoom || '__room'} className={s.room} role="group" aria-label={`Room ${room.label}`}>
                <button
                  type="button"
                  role="treeitem"
                  aria-level={1}
                  aria-selected={roomSelected}
                  aria-label={roomSelected ? `${roomLabel}, selected` : roomLabel}
                  className={`glass ${s.placeBtn} ${roomSelected ? s.placeBtnActive : ''}`}
                  onClick={() => choose(roomFilter, roomLabel)}
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
                  const caseSelected = sameFilter(current, caseFilter);
                  const caseLabel = caseName(bookcase.label, room.label, bookcase.count);
                  return (
                    <div
                      key={`${room.locationRoom}::${bookcase.locationCase}`}
                      className={s.caseBlock}
                      role="group"
                      aria-label={`Case ${bookcase.label}`}
                    >
                      <button
                        type="button"
                        role="treeitem"
                        aria-level={2}
                        aria-selected={caseSelected}
                        aria-label={caseSelected ? `${caseLabel}, selected` : caseLabel}
                        className={`glass ${s.placeBtn} ${s.caseBtn} ${caseSelected ? s.placeBtnActive : ''}`}
                        onClick={() => choose(caseFilter, caseLabel)}
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
                          const shelfSelected = sameFilter(current, shelfFilter);
                          const shelfLabel = shelfName(shelf.label, bookcase.label, room.label, shelf.count);
                          return (
                            <div key={`${room.locationRoom}::${bookcase.locationCase}::${shelf.locationShelf}`} className={s.shelfBlock}>
                              <button
                                type="button"
                                role="treeitem"
                                aria-level={3}
                                aria-selected={shelfSelected}
                                aria-label={shelfSelected ? `${shelfLabel}, selected` : shelfLabel}
                                className={`glass ${s.placeBtn} ${s.shelfBtn} ${shelfSelected ? s.placeBtnActive : ''}`}
                                onClick={() => choose(shelfFilter, shelfLabel)}
                              >
                                {shelf.label}
                                <span className={s.count}>{pluralLabel(shelf.count)}</span>
                              </button>
                              <ul className={s.bookList} aria-label={`Books on ${shelf.label}`}>
                                {shelf.books.map((book) => (
                                  <li key={book.id}>
                                    <button
                                      type="button"
                                      className={s.bookBtn}
                                      aria-label={book.author ? `Open ${book.title} by ${book.author}` : `Open ${book.title}`}
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PhysicalShelfMap;
