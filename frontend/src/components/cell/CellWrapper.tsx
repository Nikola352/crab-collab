import type { User } from "../../types/user";
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
}

export function CellWrapper({ cellId, focusedByUsers, onDelete }: CellWrapperProps) {
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
      <button
        onClick={onDelete}
        className="absolute top-2 right-2 opacity-0 group-hover/cell:opacity-100 focus:opacity-100 transition-opacity
          w-7 h-7 rounded bg-gray-700 hover:bg-red-600 text-gray-400 hover:text-white
          flex items-center justify-center text-sm z-10"
        aria-label="Delete cell"
        title="Delete cell"
      >
        &times;
      </button>
      {isCodeCell(cell) ? (
        <CodeCell cell={cell} />
      ) : (
        <MarkdownCell cell={cell} />
      )}
    </div>
  );
}
