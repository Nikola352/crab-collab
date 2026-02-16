import { useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { useWebSocket } from "../../hooks/useWebsocket";
import { useNotebookStore } from "../../stores/notebookStore";
import { useSessionStore } from "../../stores/sessionStore";
import { NotebookHeader } from "./NotebookHeader";
import { CellList } from "./CellList";
import type {
  FullStateMessage,
  JoinMessage,
  LeaveMessage,
} from "../../types/server-message";
import { useUserStore } from "../../stores/userStore";

const { VITE_WS_BASE_URL } = import.meta.env;

interface NotebookViewProps {
  userName: string;
}

export function NotebookView({ userName }: NotebookViewProps) {
  const { isConnected, send, on } = useWebSocket(`${VITE_WS_BASE_URL}/ws`);
  const hasJoined = useRef(false);

  const setSession = useSessionStore((state) => state.setSession);
  const setCells = useNotebookStore((state) => state.setCells);
  const setUsers = useUserStore((state) => state.setUsers);
  const addUser = useUserStore((state) => state.addUser);
  const removeUser = useUserStore((state) => state.removeUser);

  const handleFullState = useCallback(
    (msg: FullStateMessage) => {
      setSession(msg.user_id, userName);
      setCells(msg.notebook.cells);
      setUsers(msg.users);
    },
    [setSession, setCells, setUsers, userName],
  );

  const handleJoin = useCallback(
    (msg: JoinMessage) => {
      addUser({
        id: msg.user_id,
        name: msg.name,
        focused_cell: null,
        cursor_position: null,
      });
      toast(`${msg.name} joined the session`);
    },
    [addUser],
  );

  const handleLeave = useCallback(
    (msg: LeaveMessage) => {
      const users = useUserStore.getState().users;
      const user = users.find((u) => u.id === msg.user_id);
      removeUser(msg.user_id);
      if (user?.name) {
        toast(`${user.name} left the session`);
      }
    },
    [removeUser],
  );

  useEffect(() => {
    on("full_state", (msg) => handleFullState(msg as FullStateMessage));
    on("join", (msg) => handleJoin(msg as JoinMessage));
    on("leave", (msg) => handleLeave(msg as LeaveMessage));
  }, [on, handleFullState, handleJoin, handleLeave]);

  useEffect(() => {
    if (isConnected && !hasJoined.current) {
      hasJoined.current = true;
      send({ type: "join", name: userName });
    }
  }, [isConnected, send, userName]);

  return (
    <div className="min-h-screen bg-gray-900">
      <NotebookHeader />
      <main className="max-w-4xl mx-auto px-6 py-6">
        <CellList />
      </main>
    </div>
  );
}
