-- Physical shelf map: room, bookcase, and shelf label for each copy.
-- Empty string means unassigned. Safe to re-run on an existing library.
alter table books
  add column if not exists location_room text not null default '',
  add column if not exists location_case text not null default '',
  add column if not exists location_shelf text not null default '';
