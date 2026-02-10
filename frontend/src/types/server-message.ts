export interface PingMessage {
  type: "ping";
}

export interface JoinMessage {
  type: "join";
  user_id: string;
  name: string;
}

export interface LeaveMessage {
  type: "leave";
  user_id: string;
}

export type ServerMessage = PingMessage;
