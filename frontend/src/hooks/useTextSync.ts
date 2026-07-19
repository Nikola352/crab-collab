import { useCallback, useRef } from "react";
import { useNotebookStore } from "../stores/notebookStore";
import type { CellId } from "../types/cell";
import type { ClientMessage } from "../types/client-message";
import { TextOperation } from "../wasm/ot/ot";

type SendFn = (message: ClientMessage) => void;

const DEBOUNCE_MS = 100;

function computeDiff(oldStr: string, newStr: string): TextOperation {
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

  const operation = TextOperation.default();
  if (prefixLen > 0) {
    operation.retain(prefixLen);
  }
  if (prefixLen + suffixLen < oldStr.length) {
    operation.delete(oldStr.length - (prefixLen + suffixLen));
  }
  if (prefixLen + suffixLen < newStr.length) {
    operation.insert(newStr.slice(prefixLen, newStr.length - suffixLen));
  }
  if (suffixLen > 0) {
    operation.retain(suffixLen);
  }

  return operation;
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

        const diffOp = computeDiff(oldContent, currentContent);

        store.textEdit(cellId, diffOp, send);

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
