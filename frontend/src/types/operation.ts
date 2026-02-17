import type { Cell } from "./cell";

export type RequestId = string & { readonly __brand: "request-id" };

export interface Operation {
  id: RequestId;
  version: number;
  type: "insert" | "update_content" | "noop";
}

export type InsertOp = Operation & {
  type: "insert";
  cell: Cell;
  index: number;
};

export type UpdateContentOp = Operation & {
  type: "update_content";
  cell_id: string;
  content: string;
};

export type NoOp = Operation & {
  type: "noop";
};

export function isInsertOp(operation: Operation): operation is InsertOp {
  return operation.type === "insert";
}

export function isUpdateContentOp(
  operation: Operation,
): operation is UpdateContentOp {
  return operation.type === "update_content";
}

export function isNoOp(operation: Operation): operation is NoOp {
  return operation.type === "noop";
}
