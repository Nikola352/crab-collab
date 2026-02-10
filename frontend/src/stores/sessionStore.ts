import { create } from "zustand";

interface SessionState {
  userId: string | null;
  userName: string | null;
  isJoined: boolean;
  setSession: (userId: string, userName: string) => void;
  reset: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  userId: null,
  userName: null,
  isJoined: false,
  setSession: (userId, userName) => set({ userId, userName, isJoined: true }),
  reset: () => set({ userId: null, userName: null, isJoined: false }),
}));
