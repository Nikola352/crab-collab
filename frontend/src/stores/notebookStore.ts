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
} from "../types/operation";

import {
  type Cell,
  type CellId,
  type CellOutput,
  isCodeCell,
} from "../types/cell";
import { useUserStore } from "./userStore";
import { useSessionStore } from "./sessionStore";
import {
  apply,
  transform,
  compose,
  transform_position,
  type TextOperation,
} from "../wasm/ot/ot";
import type { SendFn, TextEditMessage } from "../types/client-message";
import { FractionalList } from "../wasm/crdt/crdt";
import { indexBetween, type CellIndex } from "../types/cell-index";
import type { UserId } from "../types/user";

interface NotebookState {
  version: number;
  cellVersions: Record<string, number>;
  cells: Record<string, Cell>;
  cellOrder: FractionalList;

  // optimistic updates applied to the UI, but not confirmed by the server
  pendingOperations: Operation[];

  // optimistic updates applied to the UI, composed into one op, not yet sent to the server
  pendingTextBuffer: Record<CellId, TextOperation | null>;

  // optimistic update applied to the UI, sent to the server, but not yet confirmed
  unconfirmedTextOperation: Record<CellId, TextEditOp | null>;

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

    confirmedState: {
      cells: {},
      cellOrder: [],
    },
    unconfirmedOperations: [],
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

    localTextEdit: (cellId: CellId, diff: TextOperation) => {
      const authorId = useSessionStore.getState().userId!;
      set((state) => {
        if (!state.cells[cellId]) return;
        editText(state, { cell_id: cellId, operation: diff }, authorId);
        const existing = state.pendingTextBuffer[cellId];
        state.pendingTextBuffer[cellId] =
          existing == null ? diff : compose(existing, diff);
      });
    },

    flushText: (cellId: CellId, send: SendFn) => {
      let didSend = false;
      set((state) => {
        didSend = tryFlushBuffer(state, cellId, send);
      });
      return didSend;
    },

    rebaseCursorPosition: (cellId: CellId, position: number) => {
      const state = get();
      let pos = position;

      const unconfirmed = state.unconfirmedTextOperation[cellId];
      if (unconfirmed != null) {
        pos = transform_position(pos, unconfirmed.operation, false);
      }

      const buffered = state.pendingTextBuffer[cellId];
      if (buffered != null) {
        pos = transform_position(pos, buffered, false);
      }

      return pos;
    },

    insertCell: (cell: Cell, prevId?: CellId, nextId?: CellId) => {
      const id = uuidv4() as RequestId;
      let operation: InsertOp | undefined;
      set((state) => {
        const prev =
          prevId && (state.cellOrder.getIndex(prevId) as CellIndex | undefined);
        const nxt =
          nextId && (state.cellOrder.getIndex(nextId) as CellIndex | undefined);
        const index = indexBetween(prev, nxt);
        const op = {
          id,
          version: state.version,
          type: "insert",
          cell,
          index,
        } as InsertOp;
        operation = op;
        applyLocalOperation(state, op);
      });
      return operation!;
    },

    removeCell: (cell: Cell) => {
      const id = uuidv4() as RequestId;
      let operation: DeleteOp | undefined;
      set((state) => {
        const op = {
          id,
          version: state.version,
          type: "delete",
          cell_id: cell.id,
        } as DeleteOp;
        operation = op;
        applyLocalOperation(state, op);
      });
      return operation!;
    },

    moveCell: (cellId: string, prevId?: CellId, nextId?: CellId) => {
      const id = uuidv4() as RequestId;
      let operation: MoveOp | undefined;
      set((state) => {
        const prev =
          prevId && (state.cellOrder.getIndex(prevId) as CellIndex | undefined);
        const nxt =
          nextId && (state.cellOrder.getIndex(nextId) as CellIndex | undefined);
        const index = indexBetween(prev, nxt);
        const op = {
          id,
          version: state.version,
          type: "move",
          cell_id: cellId,
          to_index: index,
        } as MoveOp;
        operation = op;
        applyLocalOperation(state, op);
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
        let new_index: CellIndex | undefined;
        if (isInsertOp(operation)) new_index = operation.index;
        else if (isMoveOp(operation)) new_index = operation.to_index;

        if (isOwn) {
          const pendingOp = state.pendingOperations.at(0);
          const [pending_index, pending_id] = (pendingOp
            ? extract_idx_and_id(pendingOp)
            : null) ?? [undefined, undefined];

          if (new_index && pending_index && new_index != pending_index) {
            state.cellOrder.moveTo(pending_id!, new_index);
          }

          state.pendingOperations.splice(0, 1);
        } else {
          // not own
          const pendingOp = state.pendingOperations
            .filter((op) => isInsertOp(op) || isMoveOp(op))
            .find(
              (op) =>
                (isInsertOp(op) && op.index == new_index) ||
                (isMoveOp(op) && op.to_index == new_index),
            );

          const [pending_index, pending_id] = (pendingOp
            ? extract_idx_and_id(pendingOp)
            : null) ?? [undefined, undefined];

          if (pending_index && pending_id) {
            state.cellOrder.delete(pending_id);
            handleOperation(state, operation);
            // insert at taken position will actually insert forward
            state.cellOrder.insertAt(pending_id, pending_index);
            return;
          } else {
            handleOperation(state, operation);
          }
        }
      }),

    receiveServerTextOperation: (
      operation: TextEditOp,
      isOwn: boolean,
      authorId: UserId,
    ) => {
      let wasOwnAck = false;

      set((state) => {
        const cellId = operation.cell_id;

        if (!state.cells[cellId]) return;

        if (
          isOwn &&
          operation.id === state.unconfirmedTextOperation[cellId]?.id
        ) {
          state.cellVersions[cellId] = operation.version;
          state.unconfirmedTextOperation[cellId] = null;
          wasOwnAck = true;
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

        const buffered = state.pendingTextBuffer[cellId];
        if (buffered != null) {
          const { aPrime, bPrime } = transform(text_operation, buffered);
          text_operation = aPrime;
          state.pendingTextBuffer[cellId] = bPrime;
        }

        operation.operation = text_operation;
        editText(state, operation, authorId);

        state.cellVersions[cellId] = operation.version;
      });

      return wasOwnAck;
    },

    clearUnconfirmedTextOperation: (cellId: CellId) =>
      set((state) => {
        state.unconfirmedTextOperation[cellId] = null;
      }),
  })),
);

function applyLocalOperation(state: NotebookState, operation: Operation) {
  handleOperation(state, operation);
  state.pendingOperations.push(operation);
}

function handleOperation(state: NotebookState, operation: Operation) {
  if (isInsertOp(operation)) insertCell(state, operation);
  else if (isDeleteOp(operation)) deleteCell(state, operation);
  else if (isMoveOp(operation)) moveCellInOrder(state, operation);
}

function insertCell(state: NotebookState, { cell, index }: InsertOp) {
  state.cells[cell.id] = cell;
  state.cellVersions[cell.id] = 0;
  state.pendingTextBuffer[cell.id] = null;
  state.cellOrder.insertAt(cell.id, index);
}

function deleteCell(state: NotebookState, { cell_id }: DeleteOp) {
  delete state.cells[cell_id];
  delete state.cellVersions[cell_id];
  delete state.pendingTextBuffer[cell_id];
  delete state.unconfirmedTextOperation[cell_id];
  state.cellOrder.delete(cell_id);
}

function moveCellInOrder(state: NotebookState, { cell_id, to_index }: MoveOp) {
  state.cellOrder.moveTo(cell_id, to_index);
}

function editText(
  state: NotebookState,
  { cell_id, operation }: { cell_id: CellId; operation: TextOperation },
  authorId: UserId,
) {
  state.cells[cell_id].content = apply(operation, state.cells[cell_id].content);
  useUserStore
    .getState()
    .transformfocusPositionsForTextEdit(cell_id, operation, authorId);
}

// Promotes the composed pending buffer op to `unconfirmedTextOperation` and
// sends it, iff nothing is currently in flight and there's something buffered.
// Returns whether a send actually happened.
function tryFlushBuffer(
  state: NotebookState,
  cellId: CellId,
  send: SendFn,
): boolean {
  if (!state.cells[cellId]) return false;
  if (state.unconfirmedTextOperation[cellId] != null) return false;
  const operation = state.pendingTextBuffer[cellId];
  if (operation == null) return false;

  const op: TextEditOp = {
    id: uuidv4() as RequestId,
    version: state.cellVersions[cellId] ?? 0,
    type: "text_edit",
    cell_id: cellId,
    operation,
  };
  state.unconfirmedTextOperation[cellId] = op;
  state.pendingTextBuffer[cellId] = null;

  send({
    type: "text_edit",
    context: {
      base_cell_version: op.version,
      request_id: op.id,
    },
    cell_id: cellId,
    operation: operation,
  } as TextEditMessage);

  return true;
}

function extract_idx_and_id(
  operation: Operation,
): [CellIndex, CellId] | undefined {
  if (operation && isInsertOp(operation)) {
    return [operation.index, operation.cell.id];
  } else if (operation && isMoveOp(operation)) {
    return [operation.to_index, operation.cell_id];
  }
}
