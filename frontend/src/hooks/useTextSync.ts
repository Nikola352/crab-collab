import { useCallback, useRef } from "react";
import { useNotebookStore } from "../stores/notebookStore";
import type { CellId } from "../types/cell";
import type {
  ClientMessage,
  TextDeleteMessage,
  TextInsertMessage,
} from "../types/client-message";

type SendFn = (message: ClientMessage) => void;

const DEBOUNCE_MS = 100;

function computeDiff(oldStr: string, newStr: string) {
  let prefixLen = 0;
  while (
    prefixLen < oldStr.length &&
    prefixLen < newStr.length &&
    oldStr[prefixLen] === newStr[prefixLen]
  ) {
    prefixLen++;
  }

  let suffixLen = 0;
  while (
    suffixLen < oldStr.length - prefixLen &&
    suffixLen < newStr.length - prefixLen &&
    oldStr[oldStr.length - 1 - suffixLen] ===
      newStr[newStr.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  return {
    deleteStart: prefixLen,
    deleteEnd: oldStr.length - suffixLen,
    insertText: newStr.slice(prefixLen, newStr.length - suffixLen),
  };
}

export function useTextSync(send: SendFn) {
  const lastSentContent = useRef<Map<CellId, string>>(new Map());
  const debounceTimers = useRef<Map<CellId, number>>(new Map());

  const scheduleSync = useCallback(
    (cellId: CellId, currentContent: string) => {
      const existing = debounceTimers.current.get(cellId);
      if (existing) clearTimeout(existing);

      const timer = setTimeout(() => {
        debounceTimers.current.delete(cellId);

        const store = useNotebookStore.getState();
        // Check cell still exists
        if (!store.getCell(cellId)) {
          lastSentContent.current.delete(cellId);
          return;
        }

        const oldContent = lastSentContent.current.get(cellId) ?? "";
        if (currentContent === oldContent) return;

        const diff = computeDiff(oldContent, currentContent);

        if (diff.deleteEnd > diff.deleteStart) {
          const requestId = store.textDelete(
            cellId,
            diff.deleteStart,
            diff.deleteEnd,
          );
          send({
            type: "text_delete",
            context: {
              base_version: useNotebookStore.getState().version,
              request_id: requestId,
            },
            cell_id: cellId,
            start_position: diff.deleteStart,
            end_position: diff.deleteEnd,
          } as TextDeleteMessage);
        }

        if (diff.insertText.length > 0) {
          const requestId = store.textInsert(
            cellId,
            diff.deleteStart,
            diff.insertText,
          );
          send({
            type: "text_insert",
            context: {
              base_version: useNotebookStore.getState().version,
              request_id: requestId,
            },
            cell_id: cellId,
            start_position: diff.deleteStart,
            text: diff.insertText,
          } as TextInsertMessage);
        }

        lastSentContent.current.set(cellId, currentContent);
      }, DEBOUNCE_MS);

      debounceTimers.current.set(cellId, timer);
    },
    [send],
  );

  const initCell = useCallback((cellId: CellId, content: string) => {
    lastSentContent.current.set(cellId, content);
  }, []);

  const removeCell = useCallback((cellId: CellId) => {
    const timer = debounceTimers.current.get(cellId);
    if (timer) clearTimeout(timer);
    debounceTimers.current.delete(cellId);
    lastSentContent.current.delete(cellId);
  }, []);

  return { scheduleSync, initCell, removeCell };
}
