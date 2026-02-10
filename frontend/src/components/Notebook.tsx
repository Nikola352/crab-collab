import { useEffect } from "react";
import { useWebSocket } from "../hooks/useWebsocket";

const { VITE_WS_BASE_URL } = import.meta.env;

export const Notebook = () => {
  const { isConnected, lastMessage, send, on } = useWebSocket(
    `${VITE_WS_BASE_URL}/ws`,
  );

  useEffect(() => {
    if (!isConnected) return;

    on("ping", (message) => {
      console.log(message);
    });

    const intervalId = setInterval(() => {
      send({ type: "ping" });
    }, 3000);

    return () => clearInterval(intervalId);
  }, [isConnected, send, on]);

  return (
    <>
      <h1>Notebook works!</h1>
      {lastMessage && <p>{lastMessage?.type}</p>}
    </>
  );
};

export default Notebook;
