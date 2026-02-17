import type { CellId } from "./cell";
import type { RequestId } from "./operation";

// User messages
export interface JoinMessage {
  type: "join";
  name: string;
}

// Notebook messages
export interface OperationContext {
  base_version: number;
  request_id: RequestId;
}

export interface CellInsertMessage {
  type: "cell_insert";
  context: OperationContext;
  position: number;
  cell_id: CellId;
  cell_type: "code" | "markdown";
  content?: string;
}

export interface CellDeleteMessage {
  type: "cell_delete";
  context: OperationContext;
  cell_id: CellId;
}

export type ClientMessage = JoinMessage | CellInsertMessage | CellDeleteMessage;

export function isJoinMessage(message: ClientMessage): message is JoinMessage {
  return message.type === "join";
}

export function isCellInsertMessage(
  message: ClientMessage,
): message is CellInsertMessage {
  return message.type === "cell_insert";
}


export function isCellDeleteMessage(
  message: ClientMessage,
): message is CellDeleteMessage {
  return message.type === "cell_delete";
}
