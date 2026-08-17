import type { User } from "../../types/user";
import { getUserColor } from "../../utils/userColors";

interface UserAvatarProps {
  user: User;
  size?: "sm" | "md";
  isCurrentUser?: boolean;
}

export function UserAvatar({
  user,
  size = "md",
  isCurrentUser = false,
}: UserAvatarProps) {
  const bgColor = getUserColor(user.id);
  const initial = (user.name ?? "?")[0].toUpperCase();

  const sizeClasses = {
    sm: "w-6 h-6 text-xs",
    md: "w-8 h-8 text-sm",
  };

  return (
    <div
      className={`${sizeClasses[size]} rounded-full flex items-center justify-center font-medium text-white shrink-0 ring-2 ${
        isCurrentUser ? "ring-zinc-100" : "ring-zinc-800"
      }`}
      style={{ backgroundColor: bgColor }}
      title={user.name ?? "Unknown"}
    >
      {initial}
    </div>
  );
}
