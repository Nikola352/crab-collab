import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";

import { useWebSocket } from "../../hooks/useWebsocket";
import { useNotebookStore } from "../../stores/notebookStore";
import { useSessionStore } from "../../stores/sessionStore";
import { useUserStore } from "../../stores/userStore";
import { CellList } from "./CellList";
import { NotebookHeader } from "./NotebookHeader";

import type {
  FullStateMessage,
  JoinMessage,
  LeaveMessage,
  CellInsertMessage,
  CellDeleteMessage,
  CellMoveMessage,
  OperationFailedMessage,
} from "../../types/server-message";
import type { DeleteOp, InsertOp, MoveOp, NoOp } from "../../types/operation";
import type { Cell, CellId, CellType } from "../../types/cell";
const { VITE_WS_BASE_URL } = import.meta.env;

interface NotebookViewProps {
  userName: string;
}

export function NotebookView({ userName }: NotebookViewProps) {
  const { isConnected, send, on } = useWebSocket(`${VITE_WS_BASE_URL}/ws`);
  const hasJoined = useRef(false);

  const setSession = useSessionStore((state) => state.setSession);
  const setCells = useNotebookStore((state) => state.setCells);
  const setVersion = useNotebookStore((state) => state.setVersion);
  const setUsers = useUserStore((state) => state.setUsers);
  const addUser = useUserStore((state) => state.addUser);
  const removeUser = useUserStore((state) => state.removeUser);
  const insertCell = useNotebookStore((state) => state.insertCell);
  const removeCell = useNotebookStore((state) => state.removeCell);
  const moveCellStore = useNotebookStore((state) => state.moveCell);
  const receiveServerOperation = useNotebookStore(
    (state) => state.receiveServerOperation,
  );

  const handleFullState = useCallback(
    (msg: FullStateMessage) => {
      setSession(msg.user_id, userName);
      setCells(msg.notebook.cells);
      setVersion(msg.version);
      setUsers(msg.users);
    },
    [setSession, setCells, setUsers, setVersion, userName],
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

  const handleCellInsert = useCallback(
    (msg: CellInsertMessage) => {
      const operation: InsertOp = {
        id: msg.context.request_id,
        version: msg.context.version,
        type: "insert",
        cell: msg.cell,
        index: msg.index,
      };
      const isOwn = msg.context.user_id === useSessionStore.getState().userId;
      receiveServerOperation(operation, isOwn);
    },
    [receiveServerOperation],
  );

  const handleCellDelete = useCallback(
    (msg: CellDeleteMessage) => {
      const operation: DeleteOp = {
        id: msg.context.request_id,
        version: msg.context.version,
        type: "delete",
        cell_id: msg.cell_id,
      };
      const isOwn = msg.context.user_id === useSessionStore.getState().userId;
      receiveServerOperation(operation, isOwn);
    },
    [receiveServerOperation],
  );

  const handleCellMove = useCallback(
    (msg: CellMoveMessage) => {
      const operation: MoveOp = {
        id: msg.context.request_id,
        version: msg.context.version,
        type: "move",
        cell_id: msg.cell_id,
        to_index: msg.to_index,
      };
      const isOwn = msg.context.user_id === useSessionStore.getState().userId;
      receiveServerOperation(operation, isOwn);
    },
    [receiveServerOperation],
  );

  const handleOperationFailed = useCallback(
    (msg: OperationFailedMessage) => {
      console.log("Operation failed: ", msg);
      receiveServerOperation(
        {
          id: msg.context.request_id,
          version: msg.context.version,
          type: "noop",
        } as NoOp,
        true,
      );
    },
    [receiveServerOperation],
  );

  useEffect(() => {
    on("full_state", (msg) => handleFullState(msg as FullStateMessage));
    on("join", (msg) => handleJoin(msg as JoinMessage));
    on("leave", (msg) => handleLeave(msg as LeaveMessage));
    on("cell_insert", (msg) => handleCellInsert(msg as CellInsertMessage));
    on("cell_delete", (msg) => handleCellDelete(msg as CellDeleteMessage));
    on("cell_move", (msg) => handleCellMove(msg as CellMoveMessage));
    on("operation_failed", (msg) =>
      handleOperationFailed(msg as OperationFailedMessage),
    );
  }, [
    on,
    handleFullState,
    handleJoin,
    handleLeave,
    handleCellInsert,
    handleCellDelete,
    handleCellMove,
    handleOperationFailed,
  ]);

  useEffect(() => {
    if (isConnected && !hasJoined.current) {
      hasJoined.current = true;
      send({ type: "join", name: userName });
    }
  }, [isConnected, send, userName]);

  const handleInsertCell = useCallback(
    (index: number, cellType: CellType) => {
      const cellId = uuidv4() as CellId;
      const cell: Cell =
        cellType === "code"
          ? {
              id: cellId,
              cell_type: "code",
              content: "",
              outputs: [],
              execution_number: null,
            }
          : {
              id: cellId,
              cell_type: "markdown",
              content: "",
            };

      const requestId = insertCell(cell, index);

      send({
        type: "cell_insert",
        context: {
          base_version: useNotebookStore.getState().version,
          request_id: requestId,
        },
        index,
        cell_id: uuidv4() as CellId,
        cell_type: cellType,
      });
    },
    [insertCell, send],
  );

  const handleDeleteCell = useCallback(
    (cellId: CellId) => {
      const cell = useNotebookStore.getState().getCell(cellId);
      if (!cell) return;

      const requestId = removeCell(cell);

      send({
        type: "cell_delete",
        context: {
          base_version: useNotebookStore.getState().version,
          request_id: requestId,
        },
        cell_id: cellId,
      });
    },
    [removeCell, send],
  );

  const handleMoveCell = useCallback(
    (cellId: CellId, toIndex: number) => {
      const requestId = moveCellStore(cellId, toIndex);

      send({
        type: "cell_move",
        context: {
          base_version: useNotebookStore.getState().version,
          request_id: requestId,
        },
        cell_id: cellId,
        to_index: toIndex,
      });
    },
    [moveCellStore, send],
  );

  return (
    <div className="min-h-screen bg-gray-900">
      <NotebookHeader />
      <main className="max-w-4xl mx-auto px-6 py-6">
        <CellList onInsertCell={handleInsertCell} onDeleteCell={handleDeleteCell} onMoveCell={handleMoveCell} />
      </main>
    </div>
  );
}
