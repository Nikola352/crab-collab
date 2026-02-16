import { useNotebookStore } from "../../stores/notebookStore";
import { useSessionStore } from "../../stores/sessionStore";
import { useUserStore } from "../../stores/userStore";
import { CellWrapper } from "../cell/CellWrapper";

export function CellList() {
  const cells = useNotebookStore((state) => state.cells);
  const users = useUserStore((state) => state.users);
  const currentUserId = useSessionStore((state) => state.userId);

  if (cells.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        No cells in this notebook yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {cells.map((cell) => {
        const focusedByUsers = users.filter(
          (user) => user.focused_cell === cell.id && user.id !== currentUserId,
        );

        return (
          <CellWrapper
            key={cell.id}
            cell={cell}
            focusedByUsers={focusedByUsers}
          />
        );
      })}
    </div>
  );
}
