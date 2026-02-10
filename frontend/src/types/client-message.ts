export interface PingMessage {
  type: "ping";
}

export interface JoinMessage {
  type: "join";
  name: string;
}

export type ClientMessage = PingMessage | JoinMessage;
