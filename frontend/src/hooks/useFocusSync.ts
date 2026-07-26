import { useCallback, useRef } from "react";
import type { CellId } from "../types/cell";
import type { ClientMessage } from "../types/client-message";
import { useSessionStore } from "../stores/sessionStore";
import { useUserStore } from "../stores/userStore";

type SendFn = (message: ClientMessage) => void;

export function useFocusSync(send: SendFn) {
  const lastSent = useRef<{ cellId: CellId; position: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

      timerRef.current = setTimeout(() => {
        lastSent.current = { cellId, position: cursorPosition };
        send({
          type: "change_focus",
          cell_id: cellId,
          cursor_position: cursorPosition,
        });
        timerRef.current = null;
      }, 75);
    },
    [send],
  );

  return { sendFocusChange };
}
