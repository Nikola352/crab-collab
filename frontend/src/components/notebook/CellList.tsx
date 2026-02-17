import { useMemo, useState } from "react";
import { useNotebookStore } from "../../stores/notebookStore";
import { useSessionStore } from "../../stores/sessionStore";
import { useUserStore } from "../../stores/userStore";
import { CellWrapper } from "../cell/CellWrapper";
import type { CellId, CellType } from "../../types/cell";

interface CellListProps {
  onInsertCell: (index: number, cellType: CellType) => void;
  onDeleteCell: (cellId: CellId) => void;
  onMoveCell: (cellId: CellId, toIndex: number) => void;
}

function InsertButton({
  index,
  onInsertCell,
}: {
  index: number;
  onInsertCell: (index: number, cellType: CellType) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="group flex items-center justify-center py-1">
      {!isOpen ? (
        <button
          onClick={() => setIsOpen(true)}
          className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity
            w-8 h-8 rounded-full bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-gray-200
            flex items-center justify-center text-lg"
          aria-label="Insert cell"
        >
          +
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              onInsertCell(index, "code");
              setIsOpen(false);
            }}
            className="px-3 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-gray-100 text-sm"
          >
            + Code
          </button>
          <button
            onClick={() => {
              onInsertCell(index, "markdown");
              setIsOpen(false);
            }}
            className="px-3 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-gray-100 text-sm"
          >
            + Markdown
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="px-2 py-1 rounded text-gray-500 hover:text-gray-300 text-sm"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

export function CellList({ onInsertCell, onDeleteCell, onMoveCell }: CellListProps) {
  const cellIds = useNotebookStore((state) => state.cellOrder);
  const users = useUserStore((state) => state.users);
  const currentUserId = useSessionStore((state) => state.userId);

  // Build a position lookup so we can render in stable DOM order
  const positionOf = useMemo(() => {
    const map = new Map<string, number>();
    cellIds.forEach((id, i) => map.set(id, i));
    return map;
  }, [cellIds]);

  // Render cells in a stable DOM order (sorted by ID) so React never
  // needs to detach/reattach DOM nodes — Monaco editors can't survive that.
  // CSS `order` controls the visual position instead.
  const stableIds = useMemo(() => [...cellIds].sort(), [cellIds]);

  if (cellIds.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 mb-4">No cells in this notebook yet.</p>
        <InsertButton index={0} onInsertCell={onInsertCell} />
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div style={{ order: 0 }}>
        <InsertButton index={0} onInsertCell={onInsertCell} />
      </div>
      {stableIds.map((id) => {
        const i = positionOf.get(id)!;
        const focusedByUsers = users.filter(
          (user) => user.focused_cell === id && user.id !== currentUserId,
        );

        return (
          <div key={id} style={{ order: i + 1 }}>
            <CellWrapper
              cellId={id}
              focusedByUsers={focusedByUsers}
              onDelete={() => onDeleteCell(id as CellId)}
              onMoveUp={i > 0 ? () => onMoveCell(id as CellId, i - 1) : undefined}
              onMoveDown={i < cellIds.length - 1 ? () => onMoveCell(id as CellId, i + 1) : undefined}
            />
            <InsertButton index={i + 1} onInsertCell={onInsertCell} />
          </div>
        );
      })}
    </div>
  );
}
