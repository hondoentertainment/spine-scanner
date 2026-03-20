import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LendingRecord } from '../types';

interface LendingStore {
  records: LendingRecord[];
  addRecord: (record: LendingRecord) => void;
  returnBook: (recordId: string) => void;
  removeRecord: (recordId: string) => void;
  getActiveLoans: () => LendingRecord[];
  getBookLendingHistory: (bookId: string) => LendingRecord[];
  getOverdueLoans: () => LendingRecord[];
}

export const useLendingStore = create<LendingStore>()(
  persist(
    (set, get) => ({
      records: [],

      addRecord: (record) =>
        set((state) => ({ records: [record, ...state.records] })),

      returnBook: (recordId) =>
        set((state) => ({
          records: state.records.map((r) =>
            r.id === recordId ? { ...r, returnedDate: new Date().toISOString() } : r
          ),
        })),

      removeRecord: (recordId) =>
        set((state) => ({
          records: state.records.filter((r) => r.id !== recordId),
        })),

      getActiveLoans: () =>
        get().records.filter((r) => !r.returnedDate),

      getBookLendingHistory: (bookId) =>
        get().records.filter((r) => r.bookId === bookId),

      getOverdueLoans: () => {
        const now = new Date();
        return get().records.filter(
          (r) => !r.returnedDate && r.dueDate && new Date(r.dueDate) < now
        );
      },
    }),
    {
      name: 'spine-scanner-lending',
    }
  )
);
