import { v4 as uuidv4 } from "uuid";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import {
  type DeleteOp,
  type InsertOp,
  type MoveOp,
  isDeleteOp,
  isInsertOp,
  isMoveOp,
  type Operation,
  type RequestId,
  type TextEditOp,
  isTextEditOp,
} from "../types/operation";

import {
  type Cell,
  type CellId,
  type CellOutput,
  isCodeCell,
} from "../types/cell";
import { useUserStore } from "./userStore";
import { apply, transform, type TextOperation } from "../wasm/ot/ot";
import type { ClientMessage, TextEditMessage } from "../types/client-message";

type SendFn = (message: ClientMessage) => void;

interface NotebookState {
  version: number;
  cellVersions: Record<string, number>;
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

  // optimistic updates applied to the UI, but not yet sent to the server
  pendingTextOperations: Record<CellId, TextEditOp[]>;

  // optimistic update applied to the UI, sent to the server, but not yet confirmed
  unconfirmedTextOperation: Record<CellId, TextEditOp | null>;

  setVersion: (version: number) => void;
  getCellVersion: (cellId: string) => number;
  setCellVersions: (versions: Record<string, number>) => void;
  setCellVersion: (cellId: string, version: number) => void;
  getCell: (id: string) => Cell | undefined;
  getAllCells: () => Cell[];
  setCells: (cells: Cell[]) => void;
  insertCell: (cell: Cell, index: number) => RequestId;
  removeCell: (cell: Cell) => RequestId;
  moveCell: (cellId: string, toIndex: number) => RequestId;
  textEdit: (cellId: string, operation: TextOperation, send: SendFn) => void;
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
    send: SendFn,
  ) => void;
}

export const useNotebookStore = create<NotebookState>()(
  immer((set, get) => ({
    version: 0,
    cellVersions: {},
    cells: {},
    cellOrder: [],

    confirmedState: {
      cells: {},
      cellOrder: [],
    },
    unconfirmedOperations: [],
    pendingOperations: [],

    pendingTextOperations: {},
    unconfirmedTextOperation: {},

    setVersion: (version) => set({ version }),

    getCellVersion: (cellId) => get().cellVersions[cellId] ?? 0,

    setCellVersions: (versions) => set({ cellVersions: versions }),

    setCellVersion: (cellId, version) =>
      set((state) => {
        state.cellVersions[cellId] = version;
      }),

    getCell: (id) => get().cells[id],

    getAllCells: () => get().cellOrder.map((id) => get().cells[id]),

    setCells: (cells) =>
      set({
        cells: cells.reduce((acc, cell) => ({ ...acc, [cell.id]: cell }), {}),
        cellOrder: cells.map((c) => c.id),
        pendingTextOperations: cells.reduce(
          (acc, cell) => ({ ...acc, [cell.id]: [] }),
          {},
        ),
        unconfirmedTextOperation: cells.reduce(
          (acc, cell) => ({ ...acc, [cell.id]: null }),
          {},
        ),
      }),

    textEdit: (cellId: string, operation: TextOperation, send: SendFn) => {
      const id = uuidv4() as RequestId;
      set((state) => {
        const op = {
          id,
          version: state.cellVersions[cellId] ?? 0,
          type: "text_edit",
          cell_id: cellId,
          operation,
        } as TextEditOp;
        applyLocalTextOperation(state, op, send);
      });
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
        if (state.unconfirmedOperations.length == 0) {
          handleOperation(state, operation);
          updateVersion(state, operation);
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

    receiveServerTextOperation: (
      operation: TextEditOp,
      isOwn: boolean,
      send: SendFn,
    ) =>
      set((state) => {
        const cellId = operation.cell_id;

        if (
          isOwn &&
          operation.id === state.unconfirmedTextOperation[cellId]?.id
        ) {
          state.cellVersions[cellId] = operation.version;
          state.unconfirmedTextOperation[cellId] = null;
          pushTextOpToServer(state, cellId, send);
          return;
        }

        let text_operation = operation.operation;

        const unconfirmed = state.unconfirmedTextOperation[cellId];
        if (unconfirmed != null) {
          const { aPrime: transformed } = transform(
            text_operation,
            unconfirmed.operation,
          );
          text_operation = transformed;
        }

        for (const op of state.pendingTextOperations[cellId] ?? []) {
          const { aPrime, bPrime } = transform(text_operation, op.operation);
          text_operation = aPrime;
          op.operation = bPrime;
          op.version = operation.version;
        }

        operation.operation = text_operation;
        editText(state, operation);

        state.cellVersions[cellId] = operation.version;
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

  // apply all ops and update the appropriate version counter per op
  for (const op of state.pendingOperations) {
    handleOperation(state, op);
    updateVersion(state, op);
  }

  state.pendingOperations = [];
  state.unconfirmedOperations = [];
}

function updateVersion(state: NotebookState, operation: Operation) {
  if (isTextEditOp(operation)) {
    state.cellVersions[operation.cell_id] = operation.version;
  } else if (
    isInsertOp(operation) ||
    isDeleteOp(operation) ||
    isMoveOp(operation)
  ) {
    state.version = operation.version;
  }
}

function handleOperation(state: NotebookState, operation: Operation) {
  if (isInsertOp(operation)) insertCell(state, operation);
  else if (isDeleteOp(operation)) deleteCell(state, operation);
  else if (isMoveOp(operation)) moveCellInOrder(state, operation);
}

function insertCell(state: NotebookState, { cell, index }: InsertOp) {
  state.cells[cell.id] = cell;
  state.cellVersions[cell.id] = 0;
  state.pendingTextOperations[cell.id] = [];

  if (index !== undefined && index >= 0 && index <= state.cellOrder.length) {
    state.cellOrder.splice(index, 0, cell.id);
  } else {
    state.cellOrder.push(cell.id);
  }
}

function deleteCell(state: NotebookState, { cell_id }: DeleteOp) {
  delete state.cells[cell_id];
  delete state.cellVersions[cell_id];
  delete state.pendingTextOperations[cell_id];
  state.cellOrder = state.cellOrder.filter((id) => id !== cell_id);
}

function moveCellInOrder(state: NotebookState, { cell_id, to_index }: MoveOp) {
  const currentIndex = state.cellOrder.indexOf(cell_id);
  if (currentIndex === -1) return;
  state.cellOrder.splice(currentIndex, 1);
  const clamped = Math.min(to_index, state.cellOrder.length);
  state.cellOrder.splice(clamped, 0, cell_id);
}

function applyLocalTextOperation(
  state: NotebookState,
  operation: TextEditOp,
  send: SendFn,
) {
  editText(state, operation);
  state.pendingTextOperations[operation.cell_id].push(operation);
  if (state.unconfirmedTextOperation[operation.cell_id] == null) {
    pushTextOpToServer(state, operation.cell_id, send);
  }
}

function editText(state: NotebookState, { cell_id, operation }: TextEditOp) {
  state.cells[cell_id].content = apply(operation, state.cells[cell_id].content);
  useUserStore
    .getState()
    .transformfocusPositionsForTextEdit(cell_id, operation);
}

function pushTextOpToServer(
  state: NotebookState,
  cellId: CellId,
  send: SendFn,
) {
  if (!state.pendingTextOperations[cellId]?.length) {
    return;
  }
  const operation = state.pendingTextOperations[cellId].shift()!;
  state.unconfirmedTextOperation[cellId] = operation;

  send({
    type: "text_edit",
    context: {
      base_cell_version: operation.version,
      request_id: operation.id,
    },
    cell_id: cellId,
    operation: operation.operation,
  } as TextEditMessage);
}
