import type { Cell } from "./cell";
import type { User } from "./user";

export interface Notebook {
  cells: Cell[];
  users: User[];
  user_id: string;
}
