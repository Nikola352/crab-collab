import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import {
  type DeleteOp,
  type InsertOp,
  type MoveOp,
  type Operation,
  type TextEditOp,
} from "../types/operation";

import { type Cell, type CellOutput, isCodeCell } from "../types/cell";
import type { CellId } from "../types/cell";
import { useSessionStore } from "./sessionStore";
import { FractionalList } from "../wasm/crdt/crdt";
import type { TextOperation } from "../wasm/ot/ot";
import type { SendFn } from "../types/client-message";
import type { UserId } from "../types/user";
import * as engine from "./notebookEngine";
import type { NotebookData } from "./notebookEngine";

interface NotebookState extends NotebookData {
  setVersion: (version: number) => void;
  getCellVersion: (cellId: string) => number;
  hasPendingTextOp: (cellId: CellId) => boolean;
  setCellVersions: (versions: Record<string, number>) => void;
  setCellVersion: (cellId: string, version: number) => void;
  getCell: (id: string) => Cell | undefined;
  getAllCells: () => Cell[];
  setCells: (cells: Cell[], cell_metadata?: Record<string, string>) => void;
  insertCell: (cell: Cell, prevId?: CellId, nextId?: CellId) => InsertOp;
  removeCell: (cell: Cell) => DeleteOp;
  moveCell: (cellId: string, prevId?: CellId, nextId?: CellId) => MoveOp;
  localTextEdit: (cellId: CellId, diff: TextOperation) => void;
  flushText: (cellId: CellId, send: SendFn) => boolean;
  rebaseCursorPosition: (cellId: CellId, position: number) => number;
  updateCellOutput: (cellId: string, outputs: CellOutput[]) => void;
  clearCellOutputs: (cellId: string) => void;
  setCellExecutionState: (
    cellId: string,
    state: "idle" | "pending" | "running" | "finishing",
  ) => void;
  startCellExecution: (cellId: string) => void;
  finishCellExecution: (cellId: string, executionCount: number) => void;
  receiveServerOperation: (operation: Operation, isOwn: boolean) => void;
  receiveServerTextOperation: (
    operation: TextEditOp,
    isOwn: boolean,
    authorId: UserId,
  ) => boolean;
  clearUnconfirmedTextOperation: (cellId: CellId) => void;
}

export const useNotebookStore = create<NotebookState>()(
  immer((set, get) => ({
    version: 0,
    cellVersions: {},
    cells: {},
    cellOrder: new FractionalList(),

    pendingOperations: [],

    pendingTextBuffer: {},
    unconfirmedTextOperation: {},

    setVersion: (version) => set({ version }),

    getCellVersion: (cellId) => get().cellVersions[cellId] ?? 0,

    hasPendingTextOp: (cellId) =>
      get().unconfirmedTextOperation[cellId] != null ||
      get().pendingTextBuffer[cellId] != null,

    setCellVersions: (versions) => set({ cellVersions: versions }),

    setCellVersion: (cellId, version) =>
      set((state) => {
        state.cellVersions[cellId] = version;
      }),

    getCell: (id) => get().cells[id],

    getAllCells: () =>
      get()
        .cellOrder.getOrdered()
        .map((id) => get().cells[id]),

    setCells: (cells, cell_metadata) =>
      set({
        cells: cells.reduce((acc, cell) => ({ ...acc, [cell.id]: cell }), {}),
        cellOrder: FractionalList.from(
          cells.map((c) => c.id),
          cell_metadata,
        ),
        pendingTextBuffer: cells.reduce(
          (acc, cell) => ({ ...acc, [cell.id]: null }),
          {},
        ),
        unconfirmedTextOperation: cells.reduce(
          (acc, cell) => ({ ...acc, [cell.id]: null }),
          {},
        ),
      }),

    localTextEdit: (cellId, diff) => {
      const authorId = useSessionStore.getState().userId!;
      set((state) => {
        engine.localTextEdit(state, cellId, diff, authorId);
      });
    },

    flushText: (cellId, send) => {
      let didSend = false;
      set((state) => {
        didSend = engine.tryFlushBuffer(state, cellId, send);
      });
      return didSend;
    },

    rebaseCursorPosition: (cellId, position) =>
      engine.rebaseCursorPosition(get(), cellId, position),

    insertCell: (cell, prevId, nextId) => {
      let operation: InsertOp | undefined;
      set((state) => {
        operation = engine.buildInsertOp(state, cell, prevId, nextId);
        engine.applyLocalOperation(state, operation);
      });
      return operation!;
    },

    removeCell: (cell) => {
      let operation: DeleteOp | undefined;
      set((state) => {
        operation = engine.buildDeleteOp(state, cell);
        engine.applyLocalOperation(state, operation);
      });
      return operation!;
    },

    moveCell: (cellId, prevId, nextId) => {
      let operation: MoveOp | undefined;
      set((state) => {
        operation = engine.buildMoveOp(state, cellId as CellId, prevId, nextId);
        engine.applyLocalOperation(state, operation);
      });
      return operation!;
    },

    updateCellOutput: (cellId, outputs) =>
      set((state) => {
        const cell = state.cells[cellId];
        if (cell && isCodeCell(cell)) {
          cell.outputs.push(...outputs);
        }
      }),

    clearCellOutputs: (cellId) =>
      set((state) => {
        const cell = state.cells[cellId];
        if (cell && isCodeCell(cell)) {
          cell.outputs = [];
        }
      }),

    setCellExecutionState: (cellId, state) =>
      set((draft) => {
        const cell = draft.cells[cellId];
        if (cell && isCodeCell(cell)) {
          cell.execution_state = state;
        }
      }),

    startCellExecution: (cellId) =>
      set((state) => {
        const cell = state.cells[cellId];
        if (cell && isCodeCell(cell)) {
          cell.outputs = [];
          cell.execution_state = "running";
        }
      }),

    finishCellExecution: (cellId, executionCount) =>
      set((state) => {
        const cell = state.cells[cellId];
        if (cell && isCodeCell(cell)) {
          cell.execution_number = executionCount;
          cell.execution_state = "finishing";
        }
      }),

    receiveServerOperation: (operation, isOwn) =>
      set((state) => {
        engine.receiveServerOperation(state, operation, isOwn);
      }),

    receiveServerTextOperation: (operation, isOwn, authorId) => {
      let wasOwnAck = false;
      set((state) => {
        wasOwnAck = engine.receiveServerTextOperation(
          state,
          operation,
          isOwn,
          authorId,
        );
      });
      return wasOwnAck;
    },

    clearUnconfirmedTextOperation: (cellId) =>
      set((state) => {
        state.unconfirmedTextOperation[cellId] = null;
      }),
  })),
);
