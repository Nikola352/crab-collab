import { v4 as uuidv4 } from "uuid";

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

import { type Cell, type CellId } from "../types/cell";
import { useUserStore } from "./userStore";
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

export interface NotebookData {
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
}

export function buildInsertOp(
  state: NotebookData,
  cell: Cell,
  prevId?: CellId,
  nextId?: CellId,
): InsertOp {
  const prev =
    prevId && (state.cellOrder.getIndex(prevId) as CellIndex | undefined);
  const nxt =
    nextId && (state.cellOrder.getIndex(nextId) as CellIndex | undefined);
  const index = indexBetween(prev, nxt);
  return {
    id: uuidv4() as RequestId,
    version: state.version,
    type: "insert",
    cell,
    index,
  } as InsertOp;
}

export function buildDeleteOp(state: NotebookData, cell: Cell): DeleteOp {
  return {
    id: uuidv4() as RequestId,
    version: state.version,
    type: "delete",
    cell_id: cell.id,
  } as DeleteOp;
}

export function buildMoveOp(
  state: NotebookData,
  cellId: CellId,
  prevId?: CellId,
  nextId?: CellId,
): MoveOp {
  const prev =
    prevId && (state.cellOrder.getIndex(prevId) as CellIndex | undefined);
  const nxt =
    nextId && (state.cellOrder.getIndex(nextId) as CellIndex | undefined);
  const index = indexBetween(prev, nxt);
  return {
    id: uuidv4() as RequestId,
    version: state.version,
    type: "move",
    cell_id: cellId,
    to_index: index,
  } as MoveOp;
}

export function applyLocalOperation(state: NotebookData, operation: Operation) {
  handleOperation(state, operation);
  state.pendingOperations.push(operation);
}

export function handleOperation(state: NotebookData, operation: Operation) {
  if (isInsertOp(operation)) insertCell(state, operation);
  else if (isDeleteOp(operation)) deleteCell(state, operation);
  else if (isMoveOp(operation)) moveCellInOrder(state, operation);
}

export function insertCell(state: NotebookData, { cell, index }: InsertOp) {
  state.cells[cell.id] = cell;
  state.cellVersions[cell.id] = 0;
  state.pendingTextBuffer[cell.id] = null;
  state.cellOrder.insertAt(cell.id, index);
}

export function deleteCell(state: NotebookData, { cell_id }: DeleteOp) {
  delete state.cells[cell_id];
  delete state.cellVersions[cell_id];
  delete state.pendingTextBuffer[cell_id];
  delete state.unconfirmedTextOperation[cell_id];
  state.cellOrder.delete(cell_id);
}

export function moveCellInOrder(
  state: NotebookData,
  { cell_id, to_index }: MoveOp,
) {
  state.cellOrder.moveTo(cell_id, to_index);
}

export function editText(
  state: NotebookData,
  { cell_id, operation }: { cell_id: CellId; operation: TextOperation },
  authorId: UserId,
) {
  state.cells[cell_id].content = apply(operation, state.cells[cell_id].content);
  useUserStore
    .getState()
    .transformfocusPositionsForTextEdit(cell_id, operation, authorId);
}

export function localTextEdit(
  state: NotebookData,
  cellId: CellId,
  diff: TextOperation,
  authorId: UserId,
) {
  if (!state.cells[cellId]) return;
  editText(state, { cell_id: cellId, operation: diff }, authorId);
  const existing = state.pendingTextBuffer[cellId];
  state.pendingTextBuffer[cellId] =
    existing == null ? diff : compose(existing, diff);
}

// Promotes the composed pending buffer op to `unconfirmedTextOperation` and
// sends it, iff nothing is currently in flight and there's something buffered.
// Returns whether a send actually happened.
export function tryFlushBuffer(
  state: NotebookData,
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

export function rebaseCursorPosition(
  state: NotebookData,
  cellId: CellId,
  position: number,
): number {
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
}

export function receiveServerOperation(
  state: NotebookData,
  operation: Operation,
  isOwn: boolean,
) {
  let new_index: CellIndex | undefined;
  if (isInsertOp(operation)) new_index = operation.index;
  else if (isMoveOp(operation)) new_index = operation.to_index;

  if (isOwn) {
    const pendingOp = state.pendingOperations.at(0);
    const [pending_index, pending_id] = (pendingOp
      ? extractIdxAndId(pendingOp)
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
      ? extractIdxAndId(pendingOp)
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
}

export function receiveServerTextOperation(
  state: NotebookData,
  operation: TextEditOp,
  isOwn: boolean,
  authorId: UserId,
): boolean {
  const cellId = operation.cell_id;

  if (!state.cells[cellId]) return false;

  if (isOwn && operation.id === state.unconfirmedTextOperation[cellId]?.id) {
    state.cellVersions[cellId] = operation.version;
    state.unconfirmedTextOperation[cellId] = null;
    return true;
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

  return false;
}

function extractIdxAndId(
  operation: Operation,
): [CellIndex, CellId] | undefined {
  if (operation && isInsertOp(operation)) {
    return [operation.index, operation.cell.id];
  } else if (operation && isMoveOp(operation)) {
    return [operation.to_index, operation.cell_id];
  }
}
