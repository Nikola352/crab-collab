import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import Editor, { type Monaco } from "@monaco-editor/react";
import { editor } from "monaco-editor";
import type { CellId } from "../../types/cell";
import type { User } from "../../types/user";
import { getUserColorIndex } from "../../utils/userColors";
import {
  codepointToUtf16Offset,
  utf16ToCodepointOffset,
} from "../../utils/textOffset";

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

interface CellEditorProps {
  cellId: CellId;
  content: string;
  language: string;
  focusedByUsers: User[];
  myCursorPosition: number | null;
  onContentChange: (cellId: CellId, content: string) => void;
  onFocusChange: (cellId: CellId, cursorPosition: number) => void;
  onContentDrivenFocusChange: (cellId: CellId, cursorPosition: number) => void;
  /** Extra per-cell-type setup: keybindings, blur handling. */
  onMount?: (ed: editor.IStandaloneCodeEditor) => void;
  options?: editor.IStandaloneEditorConstructionOptions;
}

/** Monaco editor with live caret sync, shared by code and markdown cells. */
export function CellEditor({
  cellId,
  content,
  language,
  focusedByUsers,
  myCursorPosition,
  onContentChange,
  onFocusChange,
  onContentDrivenFocusChange,
  onMount,
  options,
}: CellEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const decorationsRef = useRef<editor.IEditorDecorationsCollection | null>(
    null,
  );
  const [height, setHeight] = useState(60);

  const lastSeenContentRef = useRef(content);
  const isExternalContentUpdateRef = useRef(false);
  const pendingCursorRestoreRef = useRef(false);
  useLayoutEffect(() => {
    if (content !== lastSeenContentRef.current) {
      isExternalContentUpdateRef.current = true;
      const monacoValue = editorRef.current?.getModel()?.getValue();
      pendingCursorRestoreRef.current =
        monacoValue !== undefined && monacoValue !== content;
    }
  });
  useEffect(() => {
    lastSeenContentRef.current = content;
    isExternalContentUpdateRef.current = false;

    if (pendingCursorRestoreRef.current) {
      pendingCursorRestoreRef.current = false;
      const ed = editorRef.current;
      const model = ed?.getModel();
      if (ed && model && myCursorPosition != null) {
        const utf16Offset = codepointToUtf16Offset(content, myCursorPosition);
        ed.setPosition(model.getPositionAt(utf16Offset));
      }
    }
  }, [content, myCursorPosition]);

  const handleMount = useCallback(
    (ed: editor.IStandaloneCodeEditor) => {
      editorRef.current = ed;
      const model = ed.getModel();
      decorationsRef.current = ed.createDecorationsCollection(
        model ? buildRemoteCursorDecorations(model, focusedByUsers) : [],
      );

      setHeight(ed.getContentHeight());
      ed.onDidContentSizeChange(() => setHeight(ed.getContentHeight()));

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
          onFocusChange(cellId, codepointOffset);
        } else {
          onContentDrivenFocusChange(cellId, codepointOffset);
        }
      });

      ed.onDidFocusEditorText(() => {
        const focusModel = ed.getModel();
        const pos = ed.getPosition();
        if (focusModel && pos) {
          onFocusChange(
            cellId,
            utf16ToCodepointOffset(
              focusModel.getValue(),
              focusModel.getOffsetAt(pos),
            ),
          );
        }
      });

      onMount?.(ed);
    },
    [
      cellId,
      onFocusChange,
      onContentDrivenFocusChange,
      onMount,
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

  return (
    <Editor
      height={Math.max(height, 60)}
      language={language}
      value={content}
      onChange={(value) => onContentChange(cellId, value ?? "")}
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
        ...options,
      }}
    />
  );
}
