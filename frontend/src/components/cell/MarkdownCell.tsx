import { memo, useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type {
  CellId,
  MarkdownCell as MarkdownCellType,
} from "../../types/cell";
import { utf16ToCodepointOffset } from "../../utils/textOffset";

interface MarkdownCellProps {
  cell: MarkdownCellType;
  onContentChange: (cellId: CellId, content: string) => void;
  onFocusChange: (cellId: CellId, cursorPosition: number) => void;
}

export const MarkdownCell = memo(function MarkdownCell({
  cell,
  onContentChange,
  onFocusChange,
}: MarkdownCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const content = cell.content;
  const setContent = useCallback(
    (content: string) => onContentChange(cell.id, content),
    [onContentChange, cell.id],
  );

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.selectionStart = textareaRef.current.value.length;
    }
  }, [isEditing]);

  const handleDoubleClick = () => {
    setIsEditing(true);
  };

  const handleBlur = () => {
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setIsEditing(false);
    }
  };

  const reportSelectionFocus = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    onFocusChange(
      cell.id,
      utf16ToCodepointOffset(textarea.value, textarea.selectionStart ?? 0),
    );
  };

  if (isEditing) {
    return (
      <div className="bg-gray-800 rounded-lg border border-gray-600">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onSelect={reportSelectionFocus}
          onFocus={reportSelectionFocus}
          className="w-full min-h-32 p-4 bg-transparent text-gray-100 font-mono text-sm resize-y focus:outline-none"
          placeholder="Enter markdown..."
        />
      </div>
    );
  }

  return (
    <div
      className="bg-gray-800 rounded-lg p-4 cursor-text"
      onDoubleClick={handleDoubleClick}
    >
      {content ? (
        <div className="prose prose-invert prose-sm max-w-none prose-headings:text-gray-100 prose-headings:mt-4 prose-headings:mb-2 prose-headings:font-semibold prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg prose-p:text-gray-300 prose-p:my-2 prose-strong:text-gray-100 prose-em:text-gray-300 prose-code:text-blue-400 prose-code:bg-gray-900 prose-code:px-1 prose-code:rounded prose-pre:bg-gray-950 prose-pre:border prose-pre:border-gray-700 prose-a:text-blue-400 prose-ul:text-gray-300 prose-ol:text-gray-300 prose-li:text-gray-300 prose-blockquote:text-gray-400 prose-blockquote:border-gray-600">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      ) : (
        <p className="text-gray-500 italic">Double-click to edit...</p>
      )}
    </div>
  );
});
