export interface JoinMessage {
  type: "join";
  name: string;
}

export type ClientMessage = JoinMessage;

export function isJoinMessage(message: ClientMessage): message is JoinMessage {
  return message.type === "join";
}
