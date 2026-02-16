import { useNotebookStore } from "../../stores/notebookStore";
import { useSessionStore } from "../../stores/sessionStore";
import { useUserStore } from "../../stores/userStore";
import { CellWrapper } from "../cell/CellWrapper";

export function CellList() {
  const cellIds = useNotebookStore((state) => state.cellOrder);
  const users = useUserStore((state) => state.users);
  const currentUserId = useSessionStore((state) => state.userId);

  if (cellIds.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        No cells in this notebook yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {cellIds.map((id) => {
        const focusedByUsers = users.filter(
          (user) => user.focused_cell === id && user.id !== currentUserId,
        );

        return (
          <CellWrapper key={id} cellId={id} focusedByUsers={focusedByUsers} />
        );
      })}
    </div>
  );
}
