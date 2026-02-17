import { create } from "zustand";
import type { UserId } from "../types/user";

interface SessionState {
  userId: UserId | null;
  userName: string | null;
  isJoined: boolean;
  setSession: (userId: UserId, userName: string) => void;
  reset: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  userId: null,
  userName: null,
  isJoined: false,
  setSession: (userId, userName) => set({ userId, userName, isJoined: true }),
  reset: () => set({ userId: null, userName: null, isJoined: false }),
}));
