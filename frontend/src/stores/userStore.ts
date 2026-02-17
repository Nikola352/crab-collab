import { create } from "zustand";
import type { CellId } from "../types/cell";
import type { User, UserId } from "../types/user";

interface UserState {
  users: User[];
  setUsers: (users: User[]) => void;
  addUser: (user: User) => void;
  removeUser: (userId: UserId) => void;
  updateUser: (userId: UserId, updates: Partial<User>) => void;
  clearFocusForCell: (cellId: CellId) => void;
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
  updateUser: (userId, updates) =>
    set((state) => ({
      users: state.users.map((u) =>
        u.id === userId ? { ...u, ...updates } : u,
      ),
    })),
  clearFocusForCell: (cellId) =>
    set((state) => ({
      users: state.users.map((u) =>
        u.focused_cell === cellId
          ? { ...u, focused_cell: null, cursor_position: null }
          : u,
      ),
    })),
}));
