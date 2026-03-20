import { describe, it, expect, beforeEach } from 'vitest';
import { useLendingStore } from '../useLendingStore';
import type { LendingRecord } from '../../types';

function makeRecord(overrides: Partial<LendingRecord> = {}): LendingRecord {
  return {
    id: crypto.randomUUID(),
    bookId: 'book-1',
    borrowerName: 'Alice',
    lentDate: new Date().toISOString(),
    ...overrides,
  };
}

describe('useLendingStore', () => {
  beforeEach(() => {
    useLendingStore.setState({ records: [] });
  });

  it('addRecord adds a lending record', () => {
    const record = makeRecord();
    useLendingStore.getState().addRecord(record);
    expect(useLendingStore.getState().records).toHaveLength(1);
    expect(useLendingStore.getState().records[0]).toEqual(record);
  });

  it('returnBook sets returnedDate on the matching record', () => {
    const record = makeRecord({ id: 'loan-1' });
    useLendingStore.setState({ records: [record] });

    useLendingStore.getState().returnBook('loan-1');

    const updated = useLendingStore.getState().records[0];
    expect(updated.returnedDate).toBeDefined();
    expect(typeof updated.returnedDate).toBe('string');
  });

  it('returnBook does not affect other records', () => {
    const r1 = makeRecord({ id: 'loan-1' });
    const r2 = makeRecord({ id: 'loan-2', borrowerName: 'Bob' });
    useLendingStore.setState({ records: [r1, r2] });

    useLendingStore.getState().returnBook('loan-1');

    expect(useLendingStore.getState().records[1].returnedDate).toBeUndefined();
  });

  it('removeRecord removes the record', () => {
    const record = makeRecord({ id: 'loan-1' });
    useLendingStore.setState({ records: [record] });

    useLendingStore.getState().removeRecord('loan-1');
    expect(useLendingStore.getState().records).toHaveLength(0);
  });

  it('getActiveLoans filters out returned books', () => {
    const active = makeRecord({ id: 'a' });
    const returned = makeRecord({ id: 'b', returnedDate: new Date().toISOString() });
    useLendingStore.setState({ records: [active, returned] });

    const loans = useLendingStore.getState().getActiveLoans();
    expect(loans).toHaveLength(1);
    expect(loans[0].id).toBe('a');
  });

  it('getOverdueLoans returns only overdue unreturned records', () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    const tomorrow = new Date(Date.now() + 86400000).toISOString();

    const overdue = makeRecord({ id: 'overdue', dueDate: yesterday });
    const notDue = makeRecord({ id: 'ok', dueDate: tomorrow });
    const noDueDate = makeRecord({ id: 'none' });
    const returnedOverdue = makeRecord({ id: 'returned', dueDate: yesterday, returnedDate: new Date().toISOString() });

    useLendingStore.setState({ records: [overdue, notDue, noDueDate, returnedOverdue] });

    const result = useLendingStore.getState().getOverdueLoans();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('overdue');
  });

  it('getBookLendingHistory returns all records for a specific book', () => {
    const r1 = makeRecord({ bookId: 'book-1' });
    const r2 = makeRecord({ bookId: 'book-1', borrowerName: 'Bob' });
    const r3 = makeRecord({ bookId: 'book-2' });
    useLendingStore.setState({ records: [r1, r2, r3] });

    const history = useLendingStore.getState().getBookLendingHistory('book-1');
    expect(history).toHaveLength(2);
  });
});
