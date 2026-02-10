import { useNotebookStore } from "../../stores/notebookStore";
import { useSessionStore } from "../../stores/sessionStore";
import { UserAvatar } from "./UserAvatar";

export function UserPresenceBar() {
  const users = useNotebookStore((state) => state.users);
  const currentUserId = useSessionStore((state) => state.userId);

  if (users.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-gray-400 text-sm">
        {users.length} {users.length === 1 ? "user" : "users"}
      </span>
      <div className="flex -space-x-2">
        {users.map((user) => (
          <UserAvatar
            key={user.id}
            user={user}
            size="md"
            isCurrentUser={user.id === currentUserId}
          />
        ))}
      </div>
    </div>
  );
}
