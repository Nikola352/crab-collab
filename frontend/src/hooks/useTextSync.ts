import { useCallback, useRef } from "react";
import { useNotebookStore } from "../stores/notebookStore";
import type { CellId } from "../types/cell";
import type { ClientMessage } from "../types/client-message";
import { TextOperation } from "../wasm/ot/ot";

type SendFn = (message: ClientMessage) => void;

const DEBOUNCE_MS = 200;

function computeDiff(oldStr: string, newStr: string): TextOperation {
  // Diff by Unicode codepoint, not UTF-16 code unit
  const oldChars = Array.from(oldStr);
  const newChars = Array.from(newStr);

  let prefixLen = 0;
  while (
    prefixLen < oldChars.length &&
    prefixLen < newChars.length &&
    oldChars[prefixLen] === newChars[prefixLen]
  ) {
    prefixLen++;
  }

  let suffixLen = 0;
  while (
    suffixLen < oldChars.length - prefixLen &&
    suffixLen < newChars.length - prefixLen &&
    oldChars[oldChars.length - 1 - suffixLen] ===
      newChars[newChars.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  const operation = TextOperation.default();
  if (prefixLen > 0) {
    operation.retain(prefixLen);
  }
  if (prefixLen + suffixLen < oldChars.length) {
    operation.delete(oldChars.length - (prefixLen + suffixLen));
  }
  if (prefixLen + suffixLen < newChars.length) {
    operation.insert(
      newChars.slice(prefixLen, newChars.length - suffixLen).join(""),
    );
  }
  if (suffixLen > 0) {
    operation.retain(suffixLen);
  }

  return operation;
}

type ReportFocusFn = (cellId: CellId, cursorPosition: number) => void;

export function useTextSync(send: SendFn, reportFocus: ReportFocusFn) {
  const lastSentContent = useRef<Map<CellId, string>>(new Map());
  const debounceTimers = useRef<Map<CellId, number>>(new Map());
  // Cursor positions from edits (typing/paste/undo), held back so they never
  // reach other clients ahead of the text_edit that produced them
  const pendingCursorPositions = useRef<Map<CellId, number>>(new Map());

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
          pendingCursorPositions.current.delete(cellId);
          return;
        }

        const oldContent = lastSentContent.current.get(cellId) ?? "";
        if (currentContent === oldContent) return;

        const diffOp = computeDiff(oldContent, currentContent);

        store.textEdit(cellId, diffOp, send);

        lastSentContent.current.set(cellId, currentContent);

        const cursorPosition = pendingCursorPositions.current.get(cellId);
        if (cursorPosition !== undefined) {
          pendingCursorPositions.current.delete(cellId);
          reportFocus(cellId, cursorPosition);
        }
      }, DEBOUNCE_MS);

      debounceTimers.current.set(cellId, timer);
    },
    [send, reportFocus],
  );

  const noteCursorPosition = useCallback(
    (cellId: CellId, cursorPosition: number) => {
      pendingCursorPositions.current.set(cellId, cursorPosition);
    },
    [],
  );

  const initCell = useCallback((cellId: CellId, content: string) => {
    lastSentContent.current.set(cellId, content);
  }, []);

  const removeCell = useCallback((cellId: CellId) => {
    const timer = debounceTimers.current.get(cellId);
    if (timer) clearTimeout(timer);
    debounceTimers.current.delete(cellId);
    lastSentContent.current.delete(cellId);
    pendingCursorPositions.current.delete(cellId);
  }, []);

  return { scheduleSync, noteCursorPosition, initCell, removeCell };
}
