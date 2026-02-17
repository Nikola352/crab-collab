import { v4 as uuidv4 } from "uuid";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import {
  type DeleteOp,
  type InsertOp,
  type MoveOp,
  type TextInsertOp,
  type TextDeleteOp,
  isDeleteOp,
  isInsertOp,
  isMoveOp,
  isTextInsertOp,
  isTextDeleteOp,
  type Operation,
  type RequestId,
} from "../types/operation";

import type { Cell } from "../types/cell";

interface NotebookState {
  version: number;
  cells: Record<string, Cell>;
  cellOrder: string[];

  // last state that was fully confirmed by the server or null if all updates are confirmed
  confirmedState: {
    cells: Record<string, Cell>;
    cellOrder: string[];
  };

  // optimistic updates applied to the UI, but not confirmed by the server
  unconfirmedOperations: string[];

  // operations received from the server, but not yet applied to UI
  pendingOperations: Operation[];

  setVersion: (version: number) => void;
  getCell: (id: string) => Cell | undefined;
  getAllCells: () => Cell[];
  setCells: (cells: Cell[]) => void;
  insertCell: (cell: Cell, index: number) => RequestId;
  removeCell: (cell: Cell) => RequestId;
  moveCell: (cellId: string, toIndex: number) => RequestId;
  textInsert: (
    cellId: string,
    startPosition: number,
    text: string,
  ) => RequestId;
  textDelete: (
    cellId: string,
    startPosition: number,
    endPosition: number,
  ) => RequestId;
  receiveServerOperation: (operation: Operation, isOwn: boolean) => void;
}

export const useNotebookStore = create<NotebookState>()(
  immer((set, get) => ({
    version: 0,
    cells: {},
    cellOrder: [],

    confirmedState: {
      cells: {},
      cellOrder: [],
    },
    unconfirmedOperations: [],
    pendingOperations: [],

    setVersion: (version) => set({ version }),

    getCell: (id) => get().cells[id],

    getAllCells: () => get().cellOrder.map((id) => get().cells[id]),

    setCells: (cells) =>
      set({
        cells: cells.reduce((acc, cell) => ({ ...acc, [cell.id]: cell }), {}),
        cellOrder: cells.map((c) => c.id),
      }),

    textInsert: (cellId: string, startPosition: number, text: string) => {
      const id = uuidv4() as RequestId;
      set((state) => {
        const op = {
          id,
          version: state.version,
          type: "text_insert",
          cell_id: cellId,
          start_position: startPosition,
          text,
        } as TextInsertOp;
        applyLocalOperation(state, op);
      });
      return id;
    },

    textDelete: (
      cellId: string,
      startPosition: number,
      endPosition: number,
    ) => {
      const id = uuidv4() as RequestId;
      set((state) => {
        const op = {
          id,
          version: state.version,
          type: "text_delete",
          cell_id: cellId,
          start_position: startPosition,
          end_position: endPosition,
        } as TextDeleteOp;
        applyLocalOperation(state, op);
      });
      return id;
    },

    insertCell: (cell: Cell, index: number) => {
      const id = uuidv4() as RequestId;
      set((state) => {
        const op = {
          id,
          version: state.version,
          cell,
          index,
        } as InsertOp;
        applyLocalOperation(state, op);
      });
      return id;
    },

    removeCell: (cell: Cell) => {
      const id = uuidv4() as RequestId;
      set((state) => {
        const op = {
          id,
          version: state.version,
          cell_id: cell.id,
        } as DeleteOp;
        applyLocalOperation(state, op);
      });
      return id;
    },

    moveCell: (cellId: string, toIndex: number) => {
      const id = uuidv4() as RequestId;
      set((state) => {
        const op = {
          id,
          version: state.version,
          type: "move",
          cell_id: cellId,
          to_index: toIndex,
        } as MoveOp;
        applyLocalOperation(state, op);
      });
      return id;
    },

    receiveServerOperation: (operation, isOwn) =>
      set((state) => {
        if (state.unconfirmedOperations.length == 0) {
          handleOperation(state, operation);
          state.version = operation.version;
          return;
        }

        state.pendingOperations.push(operation);

        if (
          isOwn &&
          operation.id ===
            state.unconfirmedOperations[state.unconfirmedOperations.length - 1]
        ) {
          // last unconfirmed operation has arrived
          syncWithServer(state);
        }
      }),
  })),
);

function applyLocalOperation(state: NotebookState, operation: Operation) {
  if (state.unconfirmedOperations.length == 0) {
    // TODO: analyze this further
    state.confirmedState.cells = JSON.parse(JSON.stringify(state.cells));
    state.confirmedState.cellOrder = JSON.parse(
      JSON.stringify(state.cellOrder),
    );
  }
  handleOperation(state, operation);
  state.unconfirmedOperations.push(operation.id);
}

function syncWithServer(state: NotebookState) {
  if (state.pendingOperations.length === 0) {
    state.confirmedState.cells = state.cells;
    state.confirmedState.cellOrder = state.cellOrder;
    return;
  }

  // roll back
  state.cells = state.confirmedState.cells;
  state.cellOrder = state.confirmedState.cellOrder;

  // apply all ops
  for (const op of state.pendingOperations) {
    handleOperation(state, op);
  }

  state.version =
    state.pendingOperations[state.pendingOperations.length - 1].version;
  state.pendingOperations = [];
  state.unconfirmedOperations = [];
}

function handleOperation(state: NotebookState, operation: Operation) {
  if (isInsertOp(operation)) insertCell(state, operation);
  else if (isDeleteOp(operation)) deleteCell(state, operation);
  else if (isMoveOp(operation)) moveCellInOrder(state, operation);
  else if (isTextInsertOp(operation)) insertText(state, operation);
  else if (isTextDeleteOp(operation)) deleteText(state, operation);
}

function insertCell(state: NotebookState, { cell, index }: InsertOp) {
  state.cells[cell.id] = cell;

  if (index !== undefined && index >= 0 && index <= state.cellOrder.length) {
    state.cellOrder.splice(index, 0, cell.id);
  } else {
    state.cellOrder.push(cell.id);
  }
}

function deleteCell(state: NotebookState, { cell_id }: DeleteOp) {
  delete state.cells[cell_id];
  state.cellOrder = state.cellOrder.filter((id) => id !== cell_id);
}

function moveCellInOrder(state: NotebookState, { cell_id, to_index }: MoveOp) {
  const currentIndex = state.cellOrder.indexOf(cell_id);
  if (currentIndex === -1) return;
  state.cellOrder.splice(currentIndex, 1);
  const clamped = Math.min(to_index, state.cellOrder.length);
  state.cellOrder.splice(clamped, 0, cell_id);
}

function insertText(
  state: NotebookState,
  { cell_id, start_position, text }: TextInsertOp,
) {
  if (state.cells[cell_id]) {
    const content = state.cells[cell_id].content;
    const clamped = Math.min(start_position, content.length);
    state.cells[cell_id].content =
      content.slice(0, clamped) + text + content.slice(clamped);
  }
}

function deleteText(
  state: NotebookState,
  { cell_id, start_position, end_position }: TextDeleteOp,
) {
  if (state.cells[cell_id]) {
    const content = state.cells[cell_id].content;
    const clampedStart = Math.min(start_position, content.length);
    const clampedEnd = Math.min(end_position, content.length);
    state.cells[cell_id].content =
      content.slice(0, clampedStart) + content.slice(clampedEnd);
  }
}
