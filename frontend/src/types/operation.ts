import type { Cell, CellId } from "./cell";

export type RequestId = string & { readonly __brand: "request-id" };

export interface Operation {
  id: RequestId;
  version: number;
  type: "insert" | "delete" | "move" | "text_insert" | "text_delete" | "noop";
}

export type InsertOp = Operation & {
  type: "insert";
  cell: Cell;
  index: number;
};

export type DeleteOp = Operation & {
  type: "delete";
  cell_id: CellId;
};

export type TextInsertOp = Operation & {
  type: "text_insert";
  cell_id: CellId;
  start_position: number;
  text: string;
};

export type TextDeleteOp = Operation & {
  type: "text_delete";
  cell_id: CellId;
  start_position: number;
  end_position: number;
};

export type MoveOp = Operation & {
  type: "move";
  cell_id: CellId;
  to_index: number;
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

export function isTextInsertOp(
  operation: Operation,
): operation is TextInsertOp {
  return operation.type === "text_insert";
}

export function isTextDeleteOp(
  operation: Operation,
): operation is TextDeleteOp {
  return operation.type === "text_delete";
}

export function isMoveOp(operation: Operation): operation is MoveOp {
  return operation.type === "move";
}

export function isNoOp(operation: Operation): operation is NoOp {
  return operation.type === "noop";
}
