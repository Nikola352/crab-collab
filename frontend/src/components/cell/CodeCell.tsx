import { memo, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import Editor, { type Monaco } from "@monaco-editor/react";
import { KeyCode, KeyMod, editor } from "monaco-editor";
import { FiLoader, FiPlay } from "react-icons/fi";
import type { CellId, CodeCell as CodeCellType } from "../../types/cell";
import type { User } from "../../types/user";
import { getUserColorIndex } from "../../utils/userColors";
import {
  codepointToUtf16Offset,
  utf16ToCodepointOffset,
} from "../../utils/textOffset";
import { OutputArea } from "./OutputArea";

function defineCrabTheme(monaco: Monaco) {
  monaco.editor.defineTheme("crab-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#27272a",
      "editor.lineHighlightBackground": "#3f3f4680",
      "editorLineNumber.foreground": "#a1a1aa",
      "editorLineNumber.activeForeground": "#e4e4e7",
      "editor.selectionBackground": "#3866f938",
      "editorCursor.foreground": "#e4e4e7",
      "editorIndentGuide.background": "#3f3f46",
      "editorWhitespace.foreground": "#3f3f46",
    },
  });
}

function buildRemoteCursorDecorations(
  model: editor.ITextModel,
  users: User[],
): editor.IModelDeltaDecoration[] {
  return users
    .filter((u) => u.cursor_position != null)
    .map((user) => {
      const utf16Offset = codepointToUtf16Offset(
        model.getValue(),
        user.cursor_position!,
      );
      const position = model.getPositionAt(utf16Offset);
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
}

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
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const decorationsRef = useRef<editor.IEditorDecorationsCollection | null>(
    null,
  );

  const lastSeenContentRef = useRef(cell.content);
  const isExternalContentUpdateRef = useRef(false);
  const pendingCursorRestoreRef = useRef(false);
  useLayoutEffect(() => {
    if (cell.content !== lastSeenContentRef.current) {
      isExternalContentUpdateRef.current = true;
      const monacoValue = editorRef.current?.getModel()?.getValue();
      pendingCursorRestoreRef.current =
        monacoValue !== undefined && monacoValue !== cell.content;
    }
  });
  useEffect(() => {
    lastSeenContentRef.current = cell.content;
    isExternalContentUpdateRef.current = false;

    if (pendingCursorRestoreRef.current) {
      pendingCursorRestoreRef.current = false;
      const ed = editorRef.current;
      const model = ed?.getModel();
      if (ed && model && myCursorPosition != null) {
        const utf16Offset = codepointToUtf16Offset(
          cell.content,
          myCursorPosition,
        );
        ed.setPosition(model.getPositionAt(utf16Offset));
      }
    }
  }, [cell.content, myCursorPosition]);

  const setContent = useCallback(
    (content: string) => onContentChange(cell.id, content),
    [onContentChange, cell.id],
  );

  const handleMount = useCallback(
    (ed: editor.IStandaloneCodeEditor) => {
      editorRef.current = ed;
      const model = ed.getModel();
      decorationsRef.current = ed.createDecorationsCollection(
        model ? buildRemoteCursorDecorations(model, focusedByUsers) : [],
      );

      ed.onDidChangeCursorPosition((e) => {
        if (isExternalContentUpdateRef.current) return;
        const cursorModel = ed.getModel();
        const offset = cursorModel?.getOffsetAt(e.position);
        if (!cursorModel || offset === undefined) return;
        const codepointOffset = utf16ToCodepointOffset(
          cursorModel.getValue(),
          offset,
        );

        // Explicit = pure navigation (arrow keys, clicks, Home/End)
        // Anything else (typing, paste, undo/redo) moved the cursor as a side effect of an edit
        if (e.reason === editor.CursorChangeReason.Explicit) {
          onFocusChange(cell.id, codepointOffset);
        } else {
          onContentDrivenFocusChange(cell.id, codepointOffset);
        }
      });

      ed.onDidFocusEditorText(() => {
        const model = ed.getModel();
        const pos = ed.getPosition();
        if (model && pos) {
          const codepointOffset = utf16ToCodepointOffset(
            model.getValue(),
            model.getOffsetAt(pos),
          );
          onFocusChange(cell.id, codepointOffset);
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
    [
      cell.id,
      onFocusChange,
      onContentDrivenFocusChange,
      onExecute,
      focusedByUsers,
    ],
  );

  // Update remote cursor decorations when focusedByUsers changes
  useEffect(() => {
    const ed = editorRef.current;
    const collection = decorationsRef.current;
    if (!ed || !collection) return;

    const model = ed.getModel();
    if (!model) return;

    collection.set(buildRemoteCursorDecorations(model, focusedByUsers));
  }, [focusedByUsers]);

  const isRunning =
    cell.execution_state === "running" || cell.execution_state === "pending";
  const executionLabel = isRunning
    ? ""
    : cell.execution_number !== null
      ? `[${cell.execution_number}]`
      : "[ ]";

  const lineCount = cell.content.split("\n").length;
  const editorHeight = Math.max(lineCount * 20 + 16, 60);

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
          <Editor
            height={editorHeight}
            language="python"
            value={cell.content}
            onChange={(value) => setContent(value ?? "")}
            beforeMount={defineCrabTheme}
            onMount={handleMount}
            theme="crab-dark"
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
