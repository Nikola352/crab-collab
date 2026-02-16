import { create } from "zustand";
import type { User } from "../types/user";

interface UserState {
  users: User[];
  setUsers: (users: User[]) => void;
  addUser: (user: User) => void;
  removeUser: (userId: string) => void;
}

export const useUserStore = create<UserState>((set) => ({
  users: [],
  setUsers: (users) => set({ users }),
  addUser: (user) =>
    set((state) => ({
      users: state.users.some((u) => u.id === user.id)
        ? state.users
        : [...state.users, user],
    })),
  removeUser: (userId) =>
    set((state) => ({
      users: state.users.filter((u) => u.id !== userId),
    })),
}));
