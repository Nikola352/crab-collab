import type { TextOperation } from "../wasm/ot/ot";
import type { Cell, CellId } from "./cell";
import type { CellIndex } from "./cell-index";

export type RequestId = string & { readonly __brand: "request-id" };

export interface Operation {
  id: RequestId;
  version: number;
  type: "insert" | "delete" | "move" | "text_edit" | "noop";
}

export type InsertOp = Operation & {
  type: "insert";
  cell: Cell;
  index: CellIndex;
};

export type DeleteOp = Operation & {
  type: "delete";
  cell_id: CellId;
};

export type TextEditOp = Operation & {
  type: "text_edit";
  cell_id: CellId;
  operation: TextOperation;
};

export type MoveOp = Operation & {
  type: "move";
  cell_id: CellId;
  to_index: CellIndex;
};

export type NoOp = Operation & {
  type: "noop";
};

export function isInsertOp(operation: Operation): operation is InsertOp {
  return operation.type === "insert";
}

export function isDeleteOp(operation: Operation): operation is DeleteOp {
  return operation.type === "delete";
}

export function isTextEditOp(operation: Operation): operation is TextEditOp {
  return operation.type === "text_edit";
}

export function isMoveOp(operation: Operation): operation is MoveOp {
  return operation.type === "move";
}

export function isNoOp(operation: Operation): operation is NoOp {
  return operation.type === "noop";
}
