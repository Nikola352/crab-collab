import { create } from "zustand";
import type { Cell } from "../types/cell";

interface NotebookState {
  cells: Cell[];
  setCells: (cells: Cell[]) => void;
}

export const useNotebookStore = create<NotebookState>((set) => ({
  cells: [],
  setCells: (cells) => set({ cells }),
}));
