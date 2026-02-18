import { useCallback, useEffect } from "react";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";

import { useTextSync } from "./useTextSync";
import { useFocusSync } from "./useFocusSync";
import { useNotebookStore } from "../stores/notebookStore";
import { useSessionStore } from "../stores/sessionStore";
import { useUserStore } from "../stores/userStore";

import type { MessageHandler } from "./useWebsocket";
import type { ClientMessage } from "../types/client-message";
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
  ChangeFocusMessage,
  ExecutionPendingMessage,
  CellOutputMessage,
} from "../types/server-message";
import type {
  DeleteOp,
  InsertOp,
  MoveOp,
  NoOp,
  TextInsertOp,
  TextDeleteOp,
} from "../types/operation";
import type { Cell, CellId, CellType } from "../types/cell";

type SendFn = (message: ClientMessage) => void;
type OnFn = (messageType: string, handler: MessageHandler) => void;

export function useNotebookSync(send: SendFn, on: OnFn, userName: string) {
  const textSync = useTextSync(send);
  const { sendFocusChange } = useFocusSync(send);

  const setSession = useSessionStore((state) => state.setSession);
  const setCells = useNotebookStore((state) => state.setCells);
  const setVersion = useNotebookStore((state) => state.setVersion);
  const setUsers = useUserStore((state) => state.setUsers);
  const addUser = useUserStore((state) => state.addUser);
  const removeUser = useUserStore((state) => state.removeUser);
  const updateUser = useUserStore((state) => state.updateUser);
  const clearFocusForCell = useUserStore((state) => state.clearFocusForCell);
  const insertCellStore = useNotebookStore((state) => state.insertCell);
  const removeCellStore = useNotebookStore((state) => state.removeCell);
  const moveCellStore = useNotebookStore((state) => state.moveCell);
  const updateCellOutput = useNotebookStore((state) => state.updateCellOutput);
  const receiveServerOperation = useNotebookStore(
    (state) => state.receiveServerOperation,
  );

  // --- Server message handlers ---

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
      updateUser(msg.context.user_id, {
        focused_cell: msg.cell.id,
        cursor_position: 0,
      });
    },
    [receiveServerOperation, textSync, updateUser],
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
      clearFocusForCell(msg.cell_id);
    },
    [receiveServerOperation, textSync, clearFocusForCell],
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
      if (!isOwn) {
        updateUser(msg.context.user_id, {
          focused_cell: msg.cell_id,
          cursor_position: msg.start_position + msg.text.length,
        });
      }
    },
    [receiveServerOperation, textSync, updateUser],
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
      if (!isOwn) {
        updateUser(msg.context.user_id, {
          focused_cell: msg.cell_id,
          cursor_position: msg.start_position,
        });
      }
    },
    [receiveServerOperation, textSync, updateUser],
  );

  const handleChangeFocus = useCallback(
    (msg: ChangeFocusMessage) => {
      updateUser(msg.user_id, {
        focused_cell: msg.cell_id,
        cursor_position: msg.cursor_position,
      });
    },
    [updateUser],
  );

  const handleExecutionPending = useCallback(
    (_msg: ExecutionPendingMessage) => {
      // No-op for MVP — cell just waits for output
    },
    [],
  );

  const handleCellOutput = useCallback(
    (msg: CellOutputMessage) => {
      updateCellOutput(
        msg.cell_id,
        msg.outputs,
        msg.execution_count > 0 ? msg.execution_count : null,
      );
    },
    [updateCellOutput],
  );

  // --- Register server message handlers ---

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
    on("change_focus", (msg) => handleChangeFocus(msg as ChangeFocusMessage));
    on("execution_pending", (msg) =>
      handleExecutionPending(msg as ExecutionPendingMessage),
    );
    on("cell_output", (msg) => handleCellOutput(msg as CellOutputMessage));
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
    handleChangeFocus,
    handleExecutionPending,
    handleCellOutput,
  ]);

  // --- Local action handlers ---

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

      const requestId = insertCellStore(cell, index);
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

      const ownUserId = useSessionStore.getState().userId;
      if (ownUserId) {
        updateUser(ownUserId, { focused_cell: cellId, cursor_position: 0 });
      }
    },
    [insertCellStore, send, textSync, updateUser],
  );

  const handleDeleteCell = useCallback(
    (cellId: CellId) => {
      const cell = useNotebookStore.getState().getCell(cellId);
      if (!cell) return;

      const requestId = removeCellStore(cell);

      send({
        type: "cell_delete",
        context: {
          base_version: useNotebookStore.getState().version,
          request_id: requestId,
        },
        cell_id: cellId,
      });

      clearFocusForCell(cellId);
    },
    [removeCellStore, send, clearFocusForCell],
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

  const handleExecuteCell = useCallback(
    (cellId: CellId) => {
      send({ type: "execute_cell", cell_id: cellId });
    },
    [send],
  );

  return {
    handleInsertCell,
    handleDeleteCell,
    handleMoveCell,
    handleContentChange,
    handleExecuteCell,
    sendFocusChange,
  };
}
