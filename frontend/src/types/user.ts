export type UserId = string & { readonly __brand: "user-id" };

export interface User {
  id: UserId;
  name?: string;
  focused_cell: string | null;
  cursor_position: number | null;
}
