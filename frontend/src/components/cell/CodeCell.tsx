import { memo, useCallback, useEffect, useRef } from "react";
import Editor from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { KeyCode, KeyMod } from "monaco-editor";
import type { CellId, CodeCell as CodeCellType } from "../../types/cell";
import type { User } from "../../types/user";
import { getUserColorIndex } from "../../utils/userColors";
import { OutputArea } from "./OutputArea";

interface CodeCellProps {
  cell: CodeCellType;
  onContentChange: (cellId: CellId, content: string) => void;
  onFocusChange: (cellId: CellId, cursorPosition: number) => void;
  onExecute: (cellId: CellId) => void;
  focusedByUsers: User[];
}

export const CodeCell = memo(function CodeCell({
  cell,
  onContentChange,
  onFocusChange,
  onExecute,
  focusedByUsers,
}: CodeCellProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const decorationsRef = useRef<editor.IEditorDecorationsCollection | null>(
    null,
  );

  const setContent = useCallback(
    (content: string) => onContentChange(cell.id, content),
    [onContentChange, cell.id],
  );

  const handleMount = useCallback(
    (ed: editor.IStandaloneCodeEditor) => {
      editorRef.current = ed;
      decorationsRef.current = ed.createDecorationsCollection([]);

      ed.onDidChangeCursorPosition((e) => {
        const offset = ed.getModel()?.getOffsetAt(e.position);
        if (offset !== undefined) {
          onFocusChange(cell.id, offset);
        }
      });

      ed.onDidFocusEditorText(() => {
        const model = ed.getModel();
        const pos = ed.getPosition();
        if (model && pos) {
          onFocusChange(cell.id, model.getOffsetAt(pos));
        }
      });

      ed.addAction({
        id: "execute-cell",
        label: "Execute Cell",
        keybindings: [KeyMod.Shift | KeyCode.Enter],
        run: () => {
          onExecute(cell.id);
        },
      });
    },
    [cell.id, onFocusChange, onExecute],
  );

  // Update remote cursor decorations when focusedByUsers changes
  useEffect(() => {
    const ed = editorRef.current;
    const collection = decorationsRef.current;
    if (!ed || !collection) return;

    const model = ed.getModel();
    if (!model) return;

    const decorations: editor.IModelDeltaDecoration[] = focusedByUsers
      .filter((u) => u.cursor_position != null)
      .map((user) => {
        const position = model.getPositionAt(user.cursor_position!);
        const colorIndex = getUserColorIndex(user.id);
        return {
          range: {
            startLineNumber: position.lineNumber,
            startColumn: position.column,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          },
          options: {
            className: `remote-cursor-${colorIndex}`,
            hoverMessage: { value: user.name ?? "Anonymous" },
            stickiness: 1, // NeverGrowsWhenTypingAtEdges
          },
        };
      });

    collection.set(decorations);
  }, [focusedByUsers]);

  const executionLabel =
    cell.execution_state === "running" || cell.execution_state === "pending"
      ? "[*]"
      : cell.execution_number !== null
        ? `[${cell.execution_number}]`
        : "[ ]";

  const lineCount = cell.content.split("\n").length;
  const editorHeight = Math.max(lineCount * 20 + 16, 60);

  return (
    <div className="bg-gray-950 rounded-lg overflow-hidden border border-gray-800">
      <div className="flex">
        <div className="w-24 shrink-0 py-3 px-3 text-right text-gray-500 font-mono text-sm select-none bg-gray-900/50 whitespace-nowrap flex flex-col items-end gap-1">
          <span>In {executionLabel}:</span>
          <button
            onClick={() => onExecute(cell.id)}
            disabled={cell.execution_state !== "idle"}
            className="w-6 h-6 rounded bg-gray-700 hover:bg-green-700 text-gray-400 hover:text-white flex items-center justify-center text-xs disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Run cell"
            title="Run cell (Shift+Enter)"
          >
            &#9654;
          </button>
        </div>
        <div className="flex-1 min-w-0 border-l border-gray-800">
          <Editor
            height={editorHeight}
            language="python"
            value={cell.content}
            onChange={(value) => setContent(value ?? "")}
            onMount={handleMount}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              lineNumbers: "on",
              scrollBeyondLastLine: false,
              folding: false,
              lineDecorationsWidth: 8,
              lineNumbersMinChars: 3,
              renderLineHighlight: "line",
              renderLineHighlightOnlyWhenFocus: true,
              overviewRulerLanes: 0,
              hideCursorInOverviewRuler: true,
              overviewRulerBorder: false,
              scrollbar: {
                vertical: "hidden",
                horizontal: "auto",
                alwaysConsumeMouseWheel: false,
              },
              padding: { top: 12, bottom: 12 },
              fontSize: 14,
              fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
              tabSize: 4,
              wordWrap: "on",
              automaticLayout: true,
              cursorBlinking: "smooth",
              cursorSmoothCaretAnimation: "on",
              smoothScrolling: true,
            }}
          />
        </div>
      </div>
      <OutputArea outputs={cell.outputs} />
    </div>
  );
});
