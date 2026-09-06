import { memo, useCallback, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { KeyCode, editor } from "monaco-editor";

import type {
  CellId,
  MarkdownCell as MarkdownCellType,
} from "../../types/cell";
import type { User } from "../../types/user";
import { CellEditor } from "./CellEditor";

interface MarkdownCellProps {
  cell: MarkdownCellType;
  onContentChange: (cellId: CellId, content: string) => void;
  onFocusChange: (cellId: CellId, cursorPosition: number) => void;
  onContentDrivenFocusChange: (cellId: CellId, cursorPosition: number) => void;
  focusedByUsers: User[];
  myCursorPosition: number | null;
}

export const MarkdownCell = memo(function MarkdownCell({
  cell,
  onContentChange,
  onFocusChange,
  onContentDrivenFocusChange,
  focusedByUsers,
  myCursorPosition,
}: MarkdownCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const content = cell.content;

  const handleMount = useCallback((ed: editor.IStandaloneCodeEditor) => {
    ed.focus();
    const model = ed.getModel();
    if (model) ed.setPosition(model.getPositionAt(model.getValue().length));

    ed.addCommand(KeyCode.Escape, () => setIsEditing(false));
    ed.onDidBlurEditorText(() => setIsEditing(false));
  }, []);

  if (isEditing) {
    return (
      <div className="bg-zinc-800 rounded-xl border border-brand-500/40 overflow-hidden">
        <CellEditor
          cellId={cell.id}
          content={content}
          language="markdown"
          focusedByUsers={focusedByUsers}
          myCursorPosition={myCursorPosition}
          onContentChange={onContentChange}
          onFocusChange={onFocusChange}
          onContentDrivenFocusChange={onContentDrivenFocusChange}
          onMount={handleMount}
          options={{ lineNumbers: "off", lineDecorationsWidth: 16 }}
        />
      </div>
    );
  }

  return (
    <div
      className="group/md bg-zinc-800 rounded-xl border border-zinc-700 hover:border-zinc-600 transition-colors p-4 cursor-text relative"
      onDoubleClick={() => setIsEditing(true)}
    >
      {content ? (
        <div className="prose prose-invert prose-sm max-w-none prose-headings:text-zinc-100 prose-headings:mt-4 prose-headings:mb-2 prose-headings:font-semibold prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg prose-p:text-zinc-300 prose-p:my-2 prose-strong:text-zinc-100 prose-em:text-zinc-300 prose-code:text-brand-400 prose-code:bg-zinc-950 prose-code:px-1 prose-code:rounded prose-pre:bg-zinc-950 prose-pre:border prose-pre:border-zinc-700 prose-a:text-accent-400 prose-ul:text-zinc-300 prose-ol:text-zinc-300 prose-li:text-zinc-300 prose-blockquote:text-zinc-400 prose-blockquote:border-zinc-600">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      ) : (
        <p className="text-zinc-500 italic text-sm">Double-click to edit…</p>
      )}
      <span className="absolute bottom-2 right-2 text-[10px] uppercase tracking-wide text-zinc-600 opacity-0 group-hover/md:opacity-100 transition-opacity">
        Markdown
      </span>
    </div>
  );
});
