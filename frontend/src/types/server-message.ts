import type { Cell, CellId } from "./cell";
import type { Execution } from "./execution";
import type { Notebook } from "./notebook";
import type { RequestId } from "./operation";
import type { User, UserId } from "./user";

export type SerializedTextOperation = (number | string)[];

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
  cell_versions: Record<string, number>;
  pending_executions: Execution[];
  users: User[];
}

// Notebook messages
export interface NotebookStateUpdateContext {
  version: number;
  user_id: UserId;
  request_id: RequestId;
}

export interface TextStateUpdateContext {
  cell_version: number;
  user_id: UserId;
  request_id: RequestId;
}

export interface CellInsertMessage {
  type: "cell_insert";
  context: NotebookStateUpdateContext;
  index: number;
  cell: Cell;
}

export interface CellDeleteMessage {
  type: "cell_delete";
  context: NotebookStateUpdateContext;
  cell_id: CellId;
}

export interface CellMoveMessage {
  type: "cell_move";
  context: NotebookStateUpdateContext;
  cell_id: CellId;
  from_index: number;
  to_index: number;
}

export interface TextEditMessage {
  type: "text_edit";
  context: TextStateUpdateContext;
  cell_id: CellId;
  operation: SerializedTextOperation;
}

export interface OperationFailedMessage {
  type: "operation_failed";
  context: NotebookStateUpdateContext;
  message: string;
}

export interface TextOperationFailedMessage {
  type: "text_operation_failed";
  context: TextStateUpdateContext;
  message: string;
}

export interface ChangeFocusMessage {
  type: "change_focus";
  user_id: UserId;
  cell_id: CellId;
  cursor_position: number;
}

export interface ExecutionPendingMessage {
  type: "execution_pending";
  cell_id: CellId;
  user_id: UserId;
}

export interface CellOutputMessage {
  type: "cell_output";
  cell_id: CellId;
  execution_count: number;
  text: string;
}

export interface ExecutionStartedMessage {
  type: "execution_started";
  cell_id: CellId;
}

export interface ExecutionFinishedMessage {
  type: "execution_finished";
  cell_id: CellId;
  status: string;
  execution_count: number;
}

export interface CellIdleMessage {
  type: "cell_idle";
  cell_id: CellId;
}

export type ServerMessage =
  | JoinMessage
  | LeaveMessage
  | FullStateMessage
  | CellInsertMessage
  | CellDeleteMessage
  | CellMoveMessage
  | TextEditMessage
  | OperationFailedMessage
  | TextOperationFailedMessage
  | ChangeFocusMessage
  | ExecutionPendingMessage
  | CellOutputMessage
  | ExecutionStartedMessage
  | ExecutionFinishedMessage
  | CellIdleMessage;

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

export function isTextEditMessage(
  message: ServerMessage,
): message is TextEditMessage {
  return message.type === "text_edit";
}

export function isChangeFocusMessage(
  message: ServerMessage,
): message is ChangeFocusMessage {
  return message.type === "change_focus";
}

export function isTextOperationFailedMessage(
  message: ServerMessage,
): message is TextOperationFailedMessage {
  return message.type === "text_operation_failed";
}
