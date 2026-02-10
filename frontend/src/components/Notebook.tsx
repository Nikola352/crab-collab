import { useEffect } from "react";
import { useWebSocket } from "../hooks/useWebsocket";

const { VITE_WS_BASE_URL } = import.meta.env;

export const Notebook = () => {
  const { isConnected, lastMessage, send, on } = useWebSocket(
    `${VITE_WS_BASE_URL}/ws`,
  );

  useEffect(() => {
    if (!isConnected) return;

    on("join", (msg) => {
      console.log(msg);
    });

    on("leave", (msg) => {
      console.log(msg);
    });

    on("full_state", (msg) => {
      console.log(msg);
    });

    send({
      type: "join",
      name: "user" + (Math.floor(Math.random() * 5) + 1),
    });
  }, [isConnected, send, on]);

  return (
    <>
      <h1>Notebook works!</h1>
      {lastMessage && <p>{lastMessage?.type}</p>}
    </>
  );
};

export default Notebook;
