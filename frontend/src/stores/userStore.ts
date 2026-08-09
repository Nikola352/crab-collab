import { create } from "zustand";
import type { CellId } from "../types/cell";
import type { User, UserId } from "../types/user";
import { transform_position, type TextOperation } from "../wasm/ot/ot";

interface UserState {
  users: User[];
  setUsers: (users: User[]) => void;
  addUser: (user: User) => void;
  removeUser: (userId: UserId) => void;
  updateUser: (userId: UserId, updates: Partial<User>) => void;
  clearFocusForCell: (cellId: CellId) => void;
  transformfocusPositionsForTextEdit: (
    cellId: CellId,
    operation: TextOperation,
    authorId: UserId,
  ) => Record<UserId, number>;
}

export const useUserStore = create<UserState>((set, get) => ({
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

  transformfocusPositionsForTextEdit: (
    cellId: CellId,
    operation: TextOperation,
    authorId: UserId,
  ) => {
    const cursorPositions = get().users.reduce(
      (positions, user) => {
        if (user.focused_cell === cellId && user.cursor_position != null) {
          positions[user.id] = transform_position(
            user.cursor_position,
            operation,
            user.id === authorId,
          );
        }
        return positions;
      },
      {} as Record<UserId, number>,
    );

    set((state) => ({
      users: state.users.map((user) =>
        user.id in cursorPositions
          ? { ...user, cursor_position: cursorPositions[user.id] }
          : user,
      ),
    }));

    return cursorPositions;
  },
}));
