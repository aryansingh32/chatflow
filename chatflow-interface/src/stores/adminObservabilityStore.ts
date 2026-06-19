import { create } from "zustand";

export interface ObsFeedItem {
  type?: string;
  _ts?: string;
  [key: string]: unknown;
}

interface AdminObsState {
  feed: ObsFeedItem[];
  push: (item: ObsFeedItem) => void;
  clear: () => void;
}

export const useAdminObservabilityStore = create<AdminObsState>((set) => ({
  feed: [],
  push: (item) =>
    set((s) => ({
      feed: [item, ...s.feed].slice(0, 250),
    })),
  clear: () => set({ feed: [] }),
}));
