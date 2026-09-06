import { memo, useCallback } from "react";
import { KeyCode, KeyMod, editor } from "monaco-editor";
import { FiLoader, FiPlay } from "react-icons/fi";
import type { CellId, CodeCell as CodeCellType } from "../../types/cell";
import type { User } from "../../types/user";
import { CellEditor } from "./CellEditor";
import { OutputArea } from "./OutputArea";

interface CodeCellProps {
  cell: CodeCellType;
  onContentChange: (cellId: CellId, content: string) => void;
  onFocusChange: (cellId: CellId, cursorPosition: number) => void;
  onContentDrivenFocusChange: (cellId: CellId, cursorPosition: number) => void;
  onExecute: (cellId: CellId) => void;
  focusedByUsers: User[];
  myCursorPosition: number | null;
}

export const CodeCell = memo(function CodeCell({
  cell,
  onContentChange,
  onFocusChange,
  onContentDrivenFocusChange,
  onExecute,
  focusedByUsers,
  myCursorPosition,
}: CodeCellProps) {
  const handleMount = useCallback(
    (ed: editor.IStandaloneCodeEditor) => {
      ed.addAction({
        id: "execute-cell",
        label: "Execute Cell",
        keybindings: [KeyMod.Shift | KeyCode.Enter],
        run: () => {
          onExecute(cell.id);
        },
      });
    },
    [cell.id, onExecute],
  );

  const isRunning =
    cell.execution_state === "running" || cell.execution_state === "pending";
  const executionLabel = isRunning
    ? ""
    : cell.execution_number !== null
      ? `[${cell.execution_number}]`
      : "[ ]";

  return (
    <div className="bg-zinc-800 rounded-xl overflow-hidden border border-zinc-700 hover:border-zinc-600 transition-colors">
      <div className="flex">
        <div className="w-20 shrink-0 py-3 px-3 text-right text-zinc-400 font-mono text-xs select-none bg-zinc-950/50 whitespace-nowrap flex flex-col items-end gap-2">
          <span>In {executionLabel}</span>
          <button
            onClick={() => onExecute(cell.id)}
            disabled={cell.execution_state !== "idle"}
            className="w-6 h-6 rounded-md bg-zinc-700 hover:bg-brand-600 text-zinc-400 hover:text-white flex items-center justify-center disabled:opacity-60 disabled:cursor-not-allowed"
            aria-label="Run cell"
            title="Run cell (Shift+Enter)"
          >
            {isRunning ? (
              <FiLoader size={12} className="animate-spin" />
            ) : (
              <FiPlay size={11} />
            )}
          </button>
        </div>
        <div className="flex-1 min-w-0 border-l border-zinc-700">
          <CellEditor
            cellId={cell.id}
            content={cell.content}
            language="python"
            focusedByUsers={focusedByUsers}
            myCursorPosition={myCursorPosition}
            onContentChange={onContentChange}
            onFocusChange={onFocusChange}
            onContentDrivenFocusChange={onContentDrivenFocusChange}
            onMount={handleMount}
          />
        </div>
      </div>
      <OutputArea outputs={cell.outputs} />
    </div>
  );
});
