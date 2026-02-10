export interface JoinMessage {
  type: "join";
  name: string;
}

export type ClientMessage = JoinMessage;
