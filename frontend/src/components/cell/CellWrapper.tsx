import type { User } from "../../types/user";
import type { CellId } from "../../types/cell";
import { isCodeCell } from "../../types/cell";
import { CodeCell } from "./CodeCell";
import { MarkdownCell } from "./MarkdownCell";
import { UserAvatar } from "../presence/UserAvatar";
import { getUserColor } from "../../utils/userColors";
import { useNotebookStore } from "../../stores/notebookStore";

interface CellWrapperProps {
  cellId: string;
  focusedByUsers: User[];
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onContentChange: (cellId: CellId, content: string) => void;
  onFocusChange: (cellId: CellId, cursorPosition: number) => void;
  onContentDrivenFocusChange: (cellId: CellId, cursorPosition: number) => void;
  onExecute: (cellId: CellId) => void;
}

export function CellWrapper({
  cellId,
  focusedByUsers,
  onDelete,
  onMoveUp,
  onMoveDown,
  onContentChange,
  onFocusChange,
  onContentDrivenFocusChange,
  onExecute,
}: CellWrapperProps) {
  const hasFocus = focusedByUsers.length > 0;
  const borderColor = hasFocus ? getUserColor(focusedByUsers[0].id) : undefined;
  const cell = useNotebookStore((state) => state.getCell(cellId));

  if (!cell) return;

  return (
    <div
      className={`group/cell relative ${hasFocus ? "pl-1" : ""}`}
      style={
        hasFocus ? { borderLeftWidth: 3, borderLeftColor: borderColor } : {}
      }
    >
      {hasFocus && (
        <div className="absolute -left-1 top-0 flex flex-col gap-1">
          {focusedByUsers.map((user) => (
            <div key={user.id} className="-translate-x-full pr-2">
              <UserAvatar user={user} size="sm" />
            </div>
          ))}
        </div>
      )}
      <div className="absolute top-2 right-2 opacity-0 group-hover/cell:opacity-100 focus-within:opacity-100 transition-opacity flex items-center gap-1 z-10">
        {onMoveUp && (
          <button
            onClick={onMoveUp}
            className="w-7 h-7 rounded bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-white
              flex items-center justify-center text-sm"
            aria-label="Move cell up"
            title="Move cell up"
          >
            &#x2191;
          </button>
        )}
        {onMoveDown && (
          <button
            onClick={onMoveDown}
            className="w-7 h-7 rounded bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-white
              flex items-center justify-center text-sm"
            aria-label="Move cell down"
            title="Move cell down"
          >
            &#x2193;
          </button>
        )}
        <button
          onClick={onDelete}
          className="w-7 h-7 rounded bg-gray-700 hover:bg-red-600 text-gray-400 hover:text-white
            flex items-center justify-center text-sm"
          aria-label="Delete cell"
          title="Delete cell"
        >
          &times;
        </button>
      </div>
      {isCodeCell(cell) ? (
        <CodeCell
          cell={cell}
          onContentChange={onContentChange}
          onFocusChange={onFocusChange}
          onContentDrivenFocusChange={onContentDrivenFocusChange}
          onExecute={onExecute}
          focusedByUsers={focusedByUsers}
        />
      ) : (
        <MarkdownCell
          cell={cell}
          onContentChange={onContentChange}
          onFocusChange={onFocusChange}
        />
      )}
    </div>
  );
}
