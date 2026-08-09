import { useCallback, useEffect } from "react";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";

import { useTextSync } from "./useTextSync";
import { useFocusSync } from "./useFocusSync";
import { useNotebookStore } from "../stores/notebookStore";
import { useSessionStore } from "../stores/sessionStore";
import { useUserStore } from "../stores/userStore";
import { TextOperation } from "../wasm/ot/ot";

import type { MessageHandler } from "./useWebsocket";
import type { SendFn } from "../types/client-message";
import type {
  FullStateMessage,
  JoinMessage,
  LeaveMessage,
  CellInsertMessage,
  CellDeleteMessage,
  CellMoveMessage,
  TextEditMessage,
  OperationFailedMessage,
  TextOperationFailedMessage,
  ChangeFocusMessage,
  ExecutionPendingMessage,
  CellOutputMessage,
  ExecutionStartedMessage,
  ExecutionFinishedMessage,
  CellIdleMessage,
} from "../types/server-message";
import type {
  DeleteOp,
  InsertOp,
  MoveOp,
  NoOp,
  TextEditOp,
} from "../types/operation";
import {
  isCodeCell,
  type Cell,
  type CellId,
  type CellType,
  type CodeCell,
  type ExecutionState,
} from "../types/cell";
import { toCellState } from "../types/execution";

type OnFn = (messageType: string, handler: MessageHandler) => void;

export function useNotebookSync(send: SendFn, on: OnFn, userName: string) {
  const { sendFocusChange } = useFocusSync(send);
  const textSync = useTextSync(send, sendFocusChange);

  const setSession = useSessionStore((state) => state.setSession);
  const setCells = useNotebookStore((state) => state.setCells);
  const setVersion = useNotebookStore((state) => state.setVersion);
  const setCellVersions = useNotebookStore((state) => state.setCellVersions);
  const setUsers = useUserStore((state) => state.setUsers);
  const addUser = useUserStore((state) => state.addUser);
  const removeUser = useUserStore((state) => state.removeUser);
  const updateUser = useUserStore((state) => state.updateUser);
  const clearFocusForCell = useUserStore((state) => state.clearFocusForCell);
  const insertCellStore = useNotebookStore((state) => state.insertCell);
  const removeCellStore = useNotebookStore((state) => state.removeCell);
  const moveCellStore = useNotebookStore((state) => state.moveCell);
  const updateCellOutput = useNotebookStore((state) => state.updateCellOutput);
  const clearCellOutputs = useNotebookStore((state) => state.clearCellOutputs);
  const setCellExecutionState = useNotebookStore(
    (state) => state.setCellExecutionState,
  );
  const startCellExecution = useNotebookStore(
    (state) => state.startCellExecution,
  );
  const finishCellExecution = useNotebookStore(
    (state) => state.finishCellExecution,
  );
  const receiveServerOperation = useNotebookStore(
    (state) => state.receiveServerOperation,
  );
  const receiveServerTextOperation = useNotebookStore(
    (state) => state.receiveServerTextOperation,
  );

  // --- Server message handlers ---

  const handleFullState = useCallback(
    (msg: FullStateMessage) => {
      const cell_states: Record<CellId, ExecutionState> = {};
      for (const exec of msg.pending_executions) {
        cell_states[exec.cell_id] = toCellState(exec.status);
      }
      const cells = msg.notebook.cells.map((cell) => {
        if (isCodeCell(cell)) {
          return {
            ...cell,
            execution_state: cell_states[cell.id] ?? "idle",
          } as CodeCell;
        } else {
          return cell;
        }
      });
      setSession(msg.user_id, userName);
      setCells(cells, msg.cell_metadata);
      setVersion(msg.version);
      if (msg.cell_versions) {
        setCellVersions(msg.cell_versions);
      }
      setUsers(msg.users);
    },
    [setSession, setCells, setUsers, setVersion, setCellVersions, userName],
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
      const cell = isCodeCell(msg.cell)
        ? ({ ...msg.cell, execution_state: "idle" } as Cell)
        : msg.cell;
      const operation: InsertOp = {
        id: msg.context.request_id,
        version: msg.context.version,
        type: "insert",
        cell: cell,
        index: msg.index,
      };
      const isOwn = msg.context.user_id === useSessionStore.getState().userId;
      receiveServerOperation(operation, isOwn);
      updateUser(msg.context.user_id, {
        focused_cell: msg.cell.id,
        cursor_position: 0,
      });
    },
    [receiveServerOperation, updateUser],
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

  const handleTextOperationFailed = useCallback(
    (msg: TextOperationFailedMessage) => {
      console.log("Text operation failed: ", msg);
      receiveServerOperation(
        {
          id: msg.context.request_id,
          version: msg.context.cell_version,
          type: "noop",
        } as NoOp,
        true,
      );
    },
    [receiveServerOperation],
  );

  const handleTextEdit = useCallback(
    (msg: TextEditMessage) => {
      const operation: TextEditOp = {
        id: msg.context.request_id,
        version: msg.context.cell_version,
        type: "text_edit",
        cell_id: msg.cell_id,
        operation: TextOperation.fromJSON(JSON.stringify(msg.operation)),
      };
      const isOwn = msg.context.user_id === useSessionStore.getState().userId;
      const wasOwnAck = receiveServerTextOperation(
        operation,
        isOwn,
        msg.context.user_id,
      );
      if (wasOwnAck) {
        textSync.handleAckFlush(msg.cell_id);
      }
    },
    [receiveServerTextOperation, textSync],
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
    (msg: ExecutionPendingMessage) => {
      setCellExecutionState(msg.cell_id, "pending");
    },
    [setCellExecutionState],
  );

  const handleExecutionStarted = useCallback(
    (msg: ExecutionStartedMessage) => {
      startCellExecution(msg.cell_id);
      clearCellOutputs(msg.cell_id);
    },
    [startCellExecution, clearCellOutputs],
  );

  const handleCellOutput = useCallback(
    (msg: CellOutputMessage) => {
      updateCellOutput(msg.cell_id, [
        {
          text: msg.text,
          execution_number:
            msg.execution_count > 0 ? msg.execution_count : null,
        },
      ]);
    },
    [updateCellOutput],
  );

  const handleExecutionFinished = useCallback(
    (msg: ExecutionFinishedMessage) => {
      finishCellExecution(msg.cell_id, msg.execution_count);
    },
    [finishCellExecution],
  );

  const handleCellIdle = useCallback(
    (msg: CellIdleMessage) => {
      setCellExecutionState(msg.cell_id, "idle");
    },
    [setCellExecutionState],
  );

  // --- Register server message handlers ---

  useEffect(() => {
    on("full_state", (msg) => handleFullState(msg as FullStateMessage));
    on("join", (msg) => handleJoin(msg as JoinMessage));
    on("leave", (msg) => handleLeave(msg as LeaveMessage));
    on("cell_insert", (msg) => handleCellInsert(msg as CellInsertMessage));
    on("cell_delete", (msg) => handleCellDelete(msg as CellDeleteMessage));
    on("cell_move", (msg) => handleCellMove(msg as CellMoveMessage));
    on("text_edit", (msg) => handleTextEdit(msg as TextEditMessage));
    on("operation_failed", (msg) =>
      handleOperationFailed(msg as OperationFailedMessage),
    );
    on("text_operation_failed", (msg) =>
      handleTextOperationFailed(msg as TextOperationFailedMessage),
    );
    on("change_focus", (msg) => handleChangeFocus(msg as ChangeFocusMessage));
    on("execution_pending", (msg) =>
      handleExecutionPending(msg as ExecutionPendingMessage),
    );
    on("execution_started", (msg) =>
      handleExecutionStarted(msg as ExecutionStartedMessage),
    );
    on("cell_output", (msg) => handleCellOutput(msg as CellOutputMessage));
    on("execution_finished", (msg) =>
      handleExecutionFinished(msg as ExecutionFinishedMessage),
    );
    on("cell_idle", (msg) => handleCellIdle(msg as CellIdleMessage));
  }, [
    on,
    handleFullState,
    handleJoin,
    handleLeave,
    handleCellInsert,
    handleCellDelete,
    handleCellMove,
    handleTextEdit,
    handleOperationFailed,
    handleTextOperationFailed,
    handleChangeFocus,
    handleExecutionPending,
    handleExecutionStarted,
    handleCellOutput,
    handleExecutionFinished,
    handleCellIdle,
  ]);

  // --- Local action handlers ---

  const handleContentChange = useCallback(
    (cellId: CellId, content: string) => {
      textSync.handleChange(cellId, content);
    },
    [textSync],
  );

  const handleContentDrivenFocusChange = useCallback(
    (cellId: CellId, cursorPosition: number) => {
      textSync.noteCursorPosition(cellId, cursorPosition);
    },
    [textSync],
  );

  const handleInsertCell = useCallback(
    (
      prevId: CellId | undefined,
      nextId: CellId | undefined,
      cellType: CellType,
    ) => {
      const cellId = uuidv4() as CellId;
      const cell: Cell =
        cellType === "code"
          ? {
              id: cellId,
              cell_type: "code",
              content: "",
              outputs: [],
              execution_number: null,
              execution_state: "idle",
            }
          : {
              id: cellId,
              cell_type: "markdown",
              content: "",
            };

      const op = insertCellStore(cell, prevId, nextId);

      send({
        type: "cell_insert",
        context: {
          base_version: useNotebookStore.getState().version,
          request_id: op.id,
        },
        index: op.index,
        cell_id: cellId,
        cell_type: cellType,
      });

      const ownUserId = useSessionStore.getState().userId;
      if (ownUserId) {
        updateUser(ownUserId, { focused_cell: cellId, cursor_position: 0 });
      }
    },
    [insertCellStore, send, updateUser],
  );

  const handleDeleteCell = useCallback(
    (cellId: CellId) => {
      const cell = useNotebookStore.getState().getCell(cellId);
      if (!cell) return;

      const op = removeCellStore(cell);

      send({
        type: "cell_delete",
        context: {
          base_version: useNotebookStore.getState().version,
          request_id: op.id,
        },
        cell_id: cellId,
      });

      clearFocusForCell(cellId);
    },
    [removeCellStore, send, clearFocusForCell],
  );

  const handleMoveCell = useCallback(
    (cellId: CellId, prevId?: CellId, nextId?: CellId) => {
      const op = moveCellStore(cellId, prevId, nextId);

      send({
        type: "cell_move",
        context: {
          base_version: useNotebookStore.getState().version,
          request_id: op.id,
        },
        cell_id: cellId,
        to_index: op.to_index,
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
    handleContentDrivenFocusChange,
    handleExecuteCell,
    sendFocusChange,
  };
}
