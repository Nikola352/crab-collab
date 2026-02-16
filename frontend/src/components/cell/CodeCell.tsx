import Editor from "@monaco-editor/react";
import type { CodeCell as CodeCellType } from "../../types/cell";
import { OutputArea } from "./OutputArea";
import { useNotebookStore } from "../../stores/notebookStore";

interface CodeCellProps {
  cell: CodeCellType;
}

export function CodeCell({ cell }: CodeCellProps) {
  const setContent = useNotebookStore(
    (state) => (content: string) => state.updateCellContent(cell.id, content),
  );

  const executionLabel =
    cell.execution_number !== null ? `[${cell.execution_number}]` : "[ ]";

  const lineCount = cell.content.split("\n").length;
  const editorHeight = Math.max(lineCount * 20 + 16, 60);

  return (
    <div className="bg-gray-950 rounded-lg overflow-hidden border border-gray-800">
      <div className="flex">
        <div className="w-24 shrink-0 py-3 px-3 text-right text-gray-500 font-mono text-sm select-none bg-gray-900/50 whitespace-nowrap">
          In {executionLabel}:
        </div>
        <div className="flex-1 min-w-0 border-l border-gray-800">
          <Editor
            height={editorHeight}
            language="python"
            value={cell.content}
            onChange={(value) => setContent(value ?? "")}
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
      <OutputArea
        outputs={cell.outputs}
        executionNumber={cell.execution_number}
      />
    </div>
  );
}
