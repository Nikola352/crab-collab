import type { Cell, CellId } from "./cell";
import type { Notebook } from "./notebook";
import type { RequestId } from "./operation";
import type { User, UserId } from "./user";

// User messages
export interface JoinMessage {
  type: "join";
  user_id: UserId;
  name: string;
}

export interface LeaveMessage {
  type: "leave";
  user_id: UserId;
}

export interface FullStateMessage {
  type: "full_state";
  user_id: UserId;
  notebook: Notebook;
  version: number;
  users: User[];
}

// Notebook messages
export interface StateUpdateContext {
  version: number;
  user_id: UserId;
  request_id: RequestId;
}

export interface CellInsertMessage {
  type: "cell_insert";
  context: StateUpdateContext;
  index: number;
  cell: Cell;
}

export interface CellDeleteMessage {
  type: "cell_delete";
  context: StateUpdateContext;
  cell_id: CellId;
}

export interface CellMoveMessage {
  type: "cell_move";
  context: StateUpdateContext;
  cell_id: CellId;
  from_index: number;
  to_index: number;
}

export interface TextInsertMessage {
  type: "text_insert";
  context: StateUpdateContext;
  cell_id: CellId;
  start_position: number;
  end_position: number;
  text: string;
}

export interface TextDeleteMessage {
  type: "text_delete";
  context: StateUpdateContext;
  cell_id: CellId;
  start_position: number;
  end_position: number;
}

export interface OperationFailedMessage {
  type: "operation_failed";
  context: StateUpdateContext;
  message: string;
}

export interface ChangeFocusMessage {
  type: "change_focus";
  user_id: UserId;
  cell_id: CellId;
  cursor_position: number;
}

export type ServerMessage =
  | JoinMessage
  | LeaveMessage
  | FullStateMessage
  | CellInsertMessage
  | CellDeleteMessage
  | CellMoveMessage
  | TextInsertMessage
  | TextDeleteMessage
  | OperationFailedMessage
  | ChangeFocusMessage;

// Type guards
export function isJoinMessage(message: ServerMessage): message is JoinMessage {
  return message.type === "join";
}

export function isLeaveMessage(
  message: ServerMessage,
): message is LeaveMessage {
  return message.type === "leave";
}

export function isFullStateMessage(
  message: ServerMessage,
): message is FullStateMessage {
  return message.type === "full_state";
}

export function isCellInsertMessage(
  message: ServerMessage,
): message is CellInsertMessage {
  return message.type === "cell_insert";
}

export function isCellDeleteMessage(
  message: ServerMessage,
): message is CellDeleteMessage {
  return message.type === "cell_delete";
}

export function isCellMoveMessage(
  message: ServerMessage,
): message is CellMoveMessage {
  return message.type === "cell_move";
}

export function isTextInsertMessage(
  message: ServerMessage,
): message is TextInsertMessage {
  return message.type === "text_insert";
}

export function isTextDeleteMessage(
  message: ServerMessage,
): message is TextDeleteMessage {
  return message.type === "text_delete";
}

export function isChangeFocusMessage(
  message: ServerMessage,
): message is ChangeFocusMessage {
  return message.type === "change_focus";
}
