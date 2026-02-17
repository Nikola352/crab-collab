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

export interface OperationFailedMessage {
  type: "operation_failed";
  context: StateUpdateContext;
  message: string;
}

export type ServerMessage =
  | JoinMessage
  | LeaveMessage
  | FullStateMessage
  | CellInsertMessage
  | CellDeleteMessage
  | CellMoveMessage
  | OperationFailedMessage;

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
