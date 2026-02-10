import { create } from "zustand";
import type { Cell } from "../types/cell";
import type { User } from "../types/user";

interface NotebookState {
  cells: Cell[];
  users: User[];
  setCells: (cells: Cell[]) => void;
  setUsers: (users: User[]) => void;
  addUser: (user: User) => void;
  removeUser: (userId: string) => void;
}

export const useNotebookStore = create<NotebookState>((set) => ({
  cells: [],
  users: [],
  setCells: (cells) => set({ cells }),
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
