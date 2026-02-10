import type { Notebook } from "./notebook";
import type { User } from "./user";

export interface JoinMessage {
  type: "join";
  user_id: string;
  name: string;
}

export interface LeaveMessage {
  type: "leave";
  user_id: string;
}

export interface FullStateMessage {
  type: "full_state";
  user_id: string;
  notebook: Notebook;
  users: User[];
}

export type ServerMessage = JoinMessage | LeaveMessage | FullStateMessage;

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
  return message.type === "join";
}
