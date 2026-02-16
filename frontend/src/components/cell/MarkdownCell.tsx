import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { MarkdownCell as MarkdownCellType } from "../../types/cell";

interface MarkdownCellProps {
  cell: MarkdownCellType;
}

export function MarkdownCell({ cell }: MarkdownCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(cell.content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  if (isEditing) {
    return (
      <div className="bg-gray-800 rounded-lg border border-gray-600">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
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
}
