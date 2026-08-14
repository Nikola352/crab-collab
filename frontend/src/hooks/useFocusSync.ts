import { useCallback, useRef } from "react";
import type { CellId } from "../types/cell";
import type { ClientMessage } from "../types/client-message";
import { useSessionStore } from "../stores/sessionStore";
import { useUserStore } from "../stores/userStore";
import { useNotebookStore } from "../stores/notebookStore";

type SendFn = (message: ClientMessage) => void;

const DEBOUNCE_MS = 75;
const PENDING_TEXT_OP_RETRY_MS = 25;

export function useFocusSync(send: SendFn) {
  const lastSent = useRef<{ cellId: CellId; position: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trySend = useCallback(
    (cellId: CellId, cursorPosition: number) => {
      if (useNotebookStore.getState().hasPendingTextOp(cellId)) {
        timerRef.current = setTimeout(
          () => trySend(cellId, cursorPosition),
          PENDING_TEXT_OP_RETRY_MS,
        );
        return;
      }

      const baseCellVersion = useNotebookStore
        .getState()
        .getCellVersion(cellId);

      lastSent.current = { cellId, position: cursorPosition };
      send({
        type: "change_focus",
        cell_id: cellId,
        cursor_position: cursorPosition,
        base_cell_version: baseCellVersion,
      });
      timerRef.current = null;
    },
    [send],
  );

  const sendFocusChange = useCallback(
    (cellId: CellId, cursorPosition: number) => {
      const ownUserId = useSessionStore.getState().userId;
      if (ownUserId) {
        useUserStore.getState().updateUser(ownUserId, {
          focused_cell: cellId,
          cursor_position: cursorPosition,
        });
      }

      const last = lastSent.current;
      if (last && last.cellId === cellId && last.position === cursorPosition) {
        return;
      }

      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      timerRef.current = setTimeout(
        () => trySend(cellId, cursorPosition),
        DEBOUNCE_MS,
      );
    },
    [trySend],
  );

  return { sendFocusChange };
}
