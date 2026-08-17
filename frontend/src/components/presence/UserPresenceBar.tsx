import { useSessionStore } from "../../stores/sessionStore";
import { useUserStore } from "../../stores/userStore";
import { UserAvatar } from "./UserAvatar";

export function UserPresenceBar() {
  const users = useUserStore((state) => state.users);
  const currentUserId = useSessionStore((state) => state.userId);

  if (users.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-3">
      <span className="w-px h-5 bg-zinc-700" />
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
      <span className="text-zinc-500 text-xs">
        {users.length} {users.length === 1 ? "user" : "users"}
      </span>
    </div>
  );
}
