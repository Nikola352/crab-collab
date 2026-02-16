import { create } from "zustand";
import type { Cell } from "../types/cell";
import { immer } from "zustand/middleware/immer";

interface NotebookState {
  version: number;
  cells: Record<string, Cell>;
  cellOrder: string[];
  setVersion: (version: number) => void;
  getCell: (id: string) => Cell | undefined;
  getAllCells: () => Cell[];
  setCells: (cells: Cell[]) => void;
  addCell: (cell: Cell, index: number) => void;
  removeCell: (cell: Cell) => void;
  updateCellContent: (cellId: string, content: string) => void;
}

export const useNotebookStore = create<NotebookState>()(
  immer((set, get) => ({
    version: 0,
    cells: {},
    cellOrder: [],

    setVersion: (version) => set({ version }),

    getCell: (id) => get().cells[id],

    getAllCells: () => get().cellOrder.map((id) => get().cells[id]),

    setCells: (cells) =>
      set({
        cells: cells.reduce((acc, cell) => ({ ...acc, [cell.id]: cell }), {}),
        cellOrder: cells.map((c) => c.id),
      }),

    updateCellContent: (cellId, content) =>
      set((state) => {
        if (state.cells[cellId]) {
          state.cells[cellId].content = content;
        }
      }),

    // TODO: implement
    addCell: () => {},
    removeCell: () => {},
  })),
);
