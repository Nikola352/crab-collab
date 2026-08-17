import type { UserId } from "../types/user";

const COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#ca8a04", // gold
  "#65a30d", // lime
  "#22c55e", // green
  "#14b8a6", // teal
  "#0891b2", // cyan
  "#3b82f6", // blue
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#c026d3", // fuchsia
  "#ec4899", // pink
];

export function getUserColorIndex(userId: UserId): number {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash << 5) - hash + userId.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash) % COLORS.length;
}

export function getUserColor(userId: UserId): string {
  return COLORS[getUserColorIndex(userId)];
}
