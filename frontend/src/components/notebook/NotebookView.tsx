import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";

import { useWebSocket } from "../../hooks/useWebsocket";
import { useTextSync } from "../../hooks/useTextSync";
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
  TextInsertMessage,
  TextDeleteMessage,
  OperationFailedMessage,
} from "../../types/server-message";
import type {
  DeleteOp,
  InsertOp,
  MoveOp,
  NoOp,
  TextInsertOp,
  TextDeleteOp,
} from "../../types/operation";
import type { Cell, CellId, CellType } from "../../types/cell";
const { VITE_WS_BASE_URL } = import.meta.env;

interface NotebookViewProps {
  userName: string;
}

export function NotebookView({ userName }: NotebookViewProps) {
  const { isConnected, send, on } = useWebSocket(`${VITE_WS_BASE_URL}/ws`);
  const hasJoined = useRef(false);
  const textSync = useTextSync(send);

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
      for (const cell of msg.notebook.cells) {
        textSync.initCell(cell.id, cell.content);
      }
    },
    [setSession, setCells, setUsers, setVersion, userName, textSync],
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
      textSync.initCell(msg.cell.id, msg.cell.content);
    },
    [receiveServerOperation, textSync],
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
      textSync.removeCell(msg.cell_id);
    },
    [receiveServerOperation, textSync],
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

  const handleTextInsert = useCallback(
    (msg: TextInsertMessage) => {
      const operation: TextInsertOp = {
        id: msg.context.request_id,
        version: msg.context.version,
        type: "text_insert",
        cell_id: msg.cell_id,
        start_position: msg.start_position,
        text: msg.text,
      };
      const isOwn = msg.context.user_id === useSessionStore.getState().userId;
      receiveServerOperation(operation, isOwn);
      textSync.initCell(
        msg.cell_id,
        useNotebookStore.getState().getCell(msg.cell_id)?.content ?? "",
      );
    },
    [receiveServerOperation, textSync],
  );

  const handleTextDelete = useCallback(
    (msg: TextDeleteMessage) => {
      const operation: TextDeleteOp = {
        id: msg.context.request_id,
        version: msg.context.version,
        type: "text_delete",
        cell_id: msg.cell_id,
        start_position: msg.start_position,
        end_position: msg.end_position,
      };
      const isOwn = msg.context.user_id === useSessionStore.getState().userId;
      receiveServerOperation(operation, isOwn);
      textSync.initCell(
        msg.cell_id,
        useNotebookStore.getState().getCell(msg.cell_id)?.content ?? "",
      );
    },
    [receiveServerOperation, textSync],
  );

  useEffect(() => {
    on("full_state", (msg) => handleFullState(msg as FullStateMessage));
    on("join", (msg) => handleJoin(msg as JoinMessage));
    on("leave", (msg) => handleLeave(msg as LeaveMessage));
    on("cell_insert", (msg) => handleCellInsert(msg as CellInsertMessage));
    on("cell_delete", (msg) => handleCellDelete(msg as CellDeleteMessage));
    on("cell_move", (msg) => handleCellMove(msg as CellMoveMessage));
    on("text_insert", (msg) => handleTextInsert(msg as TextInsertMessage));
    on("text_delete", (msg) => handleTextDelete(msg as TextDeleteMessage));
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
    handleTextInsert,
    handleTextDelete,
    handleOperationFailed,
  ]);

  useEffect(() => {
    if (isConnected && !hasJoined.current) {
      hasJoined.current = true;
      send({ type: "join", name: userName });
    }
  }, [isConnected, send, userName]);

  const handleContentChange = useCallback(
    (cellId: CellId, content: string) => {
      textSync.scheduleSync(cellId, content);
    },
    [textSync],
  );

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
      textSync.initCell(cellId, "");

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
    [insertCell, send, textSync],
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
        <CellList
          onInsertCell={handleInsertCell}
          onDeleteCell={handleDeleteCell}
          onMoveCell={handleMoveCell}
          onContentChange={handleContentChange}
        />
      </main>
    </div>
  );
}
