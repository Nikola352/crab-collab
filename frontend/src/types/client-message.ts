import type { TextOperation } from "../wasm/ot/ot";
import type { CellId } from "./cell";
import type { CellIndex } from "./cell-index";
import type { RequestId } from "./operation";

// User messages
export interface JoinMessage {
  type: "join";
  name: string;
}

// Notebook messages
export interface NotebookOperationContext {
  base_version: number;
  request_id: RequestId;
}

export interface TextOperationContext {
  base_cell_version: number;
  request_id: RequestId;
}

export interface CellInsertMessage {
  type: "cell_insert";
  context: NotebookOperationContext;
  index: CellIndex;
  cell_id: CellId;
  cell_type: "code" | "markdown";
  content?: string;
}

export interface CellDeleteMessage {
  type: "cell_delete";
  context: NotebookOperationContext;
  cell_id: CellId;
}

export interface CellMoveMessage {
  type: "cell_move";
  context: NotebookOperationContext;
  cell_id: CellId;
  to_index: CellIndex;
}

export interface TextEditMessage {
  type: "text_edit";
  context: TextOperationContext;
  cell_id: CellId;
  operation: TextOperation;
}

export interface ChangeFocusMessage {
  type: "change_focus";
  cell_id: CellId;
  cursor_position: number;
}

export interface ExecuteCellMessage {
  type: "execute_cell";
  cell_id: CellId;
}

export type ClientMessage =
  | JoinMessage
  | CellInsertMessage
  | CellDeleteMessage
  | CellMoveMessage
  | TextEditMessage
  | ChangeFocusMessage
  | ExecuteCellMessage;

export type SendFn = (message: ClientMessage) => void;

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

export function isCellMoveMessage(
  message: ClientMessage,
): message is CellMoveMessage {
  return message.type === "cell_move";
}
