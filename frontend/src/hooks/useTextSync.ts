import { useCallback, useEffect, useRef } from "react";
import { useNotebookStore } from "../stores/notebookStore";
import type { CellId } from "../types/cell";
import type { SendFn } from "../types/client-message";
import { computeDiff } from "../utils/textDiff";

const IDLE_DEBOUNCE_MS = 100;
const SEND_THROTTLE_MS = 100;

type ReportFocusFn = (cellId: CellId, cursorPosition: number) => void;

export function useTextSync(send: SendFn, reportFocus: ReportFocusFn) {
  const idleTimers = useRef<Map<CellId, number>>(new Map());
  const retryTimers = useRef<Map<CellId, number>>(new Map());
  const burstTimers = useRef<Map<CellId, number>>(new Map());

  const lastFlushAt = useRef<Map<CellId, number>>(new Map());

  // Cursor positions from edits (typing/paste/undo), held back so they never
  // reach other clients ahead of the text_edit that produced them
  const pendingCursorPositions = useRef<Map<CellId, number>>(new Map());

  const flushCursorIfPending = useCallback(
    (cellId: CellId) => {
      const cursorPosition = pendingCursorPositions.current.get(cellId);
      if (cursorPosition !== undefined) {
        pendingCursorPositions.current.delete(cellId);
        reportFocus(cellId, cursorPosition);
      }
    },
    [reportFocus],
  );

  const attemptFlushRef = useRef<(cellId: CellId) => void>(() => {});

  const scheduleIn = useCallback(
    (timers: Map<CellId, number>, cellId: CellId, delay: number) => {
      const existing = timers.get(cellId);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        timers.delete(cellId);
        attemptFlushRef.current(cellId);
      }, delay);
      timers.set(cellId, timer);
    },
    [],
  );

  const scheduleIfAbsent = useCallback(
    (timers: Map<CellId, number>, cellId: CellId, delay: number) => {
      if (timers.has(cellId)) return;
      const timer = setTimeout(() => {
        timers.delete(cellId);
        attemptFlushRef.current(cellId);
      }, delay);
      timers.set(cellId, timer);
    },
    [],
  );

  const attemptFlush = useCallback(
    (cellId: CellId) => {
      const now = Date.now();
      const elapsed = now - (lastFlushAt.current.get(cellId) ?? 0);
      if (elapsed < SEND_THROTTLE_MS) {
        scheduleIn(retryTimers.current, cellId, SEND_THROTTLE_MS - elapsed);
      } else {
        const sent = useNotebookStore.getState().flushText(cellId, send);
        if (sent) {
          lastFlushAt.current.set(cellId, now);
        }
      }
      flushCursorIfPending(cellId);
    },
    [send, flushCursorIfPending, scheduleIn],
  );

  useEffect(() => {
    attemptFlushRef.current = attemptFlush;
  }, [attemptFlush]);

  const handleChange = useCallback(
    (cellId: CellId, content: string) => {
      const store = useNotebookStore.getState();
      const cell = store.getCell(cellId);
      if (!cell) return;

      const diff = computeDiff(cell.content, content);
      store.localTextEdit(cellId, diff);

      scheduleIn(idleTimers.current, cellId, IDLE_DEBOUNCE_MS);
      scheduleIfAbsent(burstTimers.current, cellId, SEND_THROTTLE_MS);
    },
    [scheduleIn, scheduleIfAbsent],
  );

  const noteCursorPosition = useCallback(
    (cellId: CellId, cursorPosition: number) => {
      pendingCursorPositions.current.set(cellId, cursorPosition);
    },
    [],
  );

  const handleAckFlush = useCallback(
    (cellId: CellId) => {
      attemptFlush(cellId);
    },
    [attemptFlush],
  );

  const removeCell = useCallback((cellId: CellId) => {
    const idle = idleTimers.current.get(cellId);
    if (idle) clearTimeout(idle);
    idleTimers.current.delete(cellId);

    const retry = retryTimers.current.get(cellId);
    if (retry) clearTimeout(retry);
    retryTimers.current.delete(cellId);

    const burst = burstTimers.current.get(cellId);
    if (burst) clearTimeout(burst);
    burstTimers.current.delete(cellId);

    lastFlushAt.current.delete(cellId);
    pendingCursorPositions.current.delete(cellId);
  }, []);

  return { handleChange, noteCursorPosition, handleAckFlush, removeCell };
}
