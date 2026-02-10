export interface User {
  id: string;
  name?: string;
  focused_cell: string | null;
  cursor_position: number | null;
}
