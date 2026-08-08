import { useCallback, useMemo, useState } from "react";
import { useNotebookStore } from "../../stores/notebookStore";
import { useSessionStore } from "../../stores/sessionStore";
import { useUserStore } from "../../stores/userStore";
import { CellWrapper } from "../cell/CellWrapper";
import type { CellId, CellType } from "../../types/cell";
import { useShallow } from "zustand/shallow";

interface CellListProps {
  onInsertCell: (
    prevId: CellId | undefined,
    nextId: CellId | undefined,
    cellType: CellType,
  ) => void;
  onDeleteCell: (cellId: CellId) => void;
  onMoveCell: (cellId: CellId, prevId?: CellId, nextId?: CellId) => void;
  onContentChange: (cellId: CellId, content: string) => void;
  onFocusChange: (cellId: CellId, cursorPosition: number) => void;
  onContentDrivenFocusChange: (cellId: CellId, cursorPosition: number) => void;
  onExecuteCell: (cellId: CellId) => void;
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

export function CellList({
  onInsertCell,
  onDeleteCell,
  onMoveCell,
  onContentChange,
  onFocusChange,
  onContentDrivenFocusChange,
  onExecuteCell,
}: CellListProps) {
  const cellIds = useNotebookStore(
    useShallow((state) => state.cellOrder.getOrdered()),
  );
  const users = useUserStore((state) => state.users);
  const currentUserId = useSessionStore((state) => state.userId);

  // Build a position lookup so we can render in stable DOM order
  const positionOf = useMemo(() => {
    const map = new Map<string, number>();
    cellIds.forEach((id, i) => map.set(id, i));
    return map;
  }, [cellIds]);

  const cellsAroundIdx = useMemo(() => {
    const map = new Map<number, (string | undefined)[]>();

    if (cellIds.length === 0) {
      map.set(0, [undefined, undefined]);
      return map;
    }

    map.set(0, [undefined, cellIds.at(0)]);
    for (let i = 1; i < cellIds.length; i++) {
      map.set(i, [cellIds[i - 1], cellIds[i]]);
    }
    map.set(cellIds.length, [cellIds[cellIds.length - 1], undefined]);
    return map;
  }, [cellIds]);

  const insertAt = useCallback(
    (index: number, cellType: CellType) => {
      const [left, right] = cellsAroundIdx.get(index) ?? [undefined, undefined];
      onInsertCell(left as CellId, right as CellId, cellType);
    },
    [cellsAroundIdx],
  );

  const moveTo = useCallback(
    (id: CellId, index: number) => {
      const [left, right] = cellsAroundIdx.get(index) ?? [undefined, undefined];
      onMoveCell(id, left as CellId, right as CellId);
    },
    [cellsAroundIdx],
  );

  // Render cells in a stable DOM order (sorted by ID) so React never
  // needs to detach/reattach DOM nodes — Monaco editors can't survive that.
  // CSS `order` controls the visual position instead.
  const stableIds = useMemo(() => [...cellIds].sort(), [cellIds]);

  if (cellIds.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 mb-4">No cells in this notebook yet.</p>
        <InsertButton index={0} onInsertCell={insertAt} />
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div style={{ order: 0 }}>
        <InsertButton index={0} onInsertCell={insertAt} />
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
              onMoveUp={i > 0 ? () => moveTo(id as CellId, i - 1) : undefined}
              onMoveDown={
                i < cellIds.length - 1
                  ? () => moveTo(id as CellId, i + 2)
                  : undefined
              }
              onContentChange={onContentChange}
              onFocusChange={onFocusChange}
              onContentDrivenFocusChange={onContentDrivenFocusChange}
              onExecute={onExecuteCell}
            />
            <InsertButton index={i + 1} onInsertCell={insertAt} />
          </div>
        );
      })}
    </div>
  );
}
