import type { CellId, ExecutionState } from "./cell";
import type { UserId } from "./user";

export interface Execution {
  cell_id: CellId;
  user_id: UserId;
  status: ExecutionStatus;
}

export type ExecutionStatus = "pending" | "executing" | "finished";

export function toCellState(status: ExecutionStatus): ExecutionState {
  switch (status) {
    case "pending":
      return "pending";
    case "executing":
      return "running";
    case "finished":
      return "finishing";
  }
}
