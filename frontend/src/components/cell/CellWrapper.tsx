import type { Cell } from "../../types/cell";
import type { User } from "../../types/user";
import { isCodeCell } from "../../types/cell";
import { CodeCell } from "./CodeCell";
import { MarkdownCell } from "./MarkdownCell";
import { UserAvatar } from "../presence/UserAvatar";
import { getUserColor } from "../../utils/userColors";

interface CellWrapperProps {
  cell: Cell;
  focusedByUsers: User[];
}

export function CellWrapper({ cell, focusedByUsers }: CellWrapperProps) {
  const hasFocus = focusedByUsers.length > 0;
  const borderColor = hasFocus ? getUserColor(focusedByUsers[0].id) : undefined;

  return (
    <div
      className={`relative ${hasFocus ? "pl-1" : ""}`}
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
      {isCodeCell(cell) ? (
        <CodeCell cell={cell} />
      ) : (
        <MarkdownCell cell={cell} />
      )}
    </div>
  );
}
