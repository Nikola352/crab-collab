export type CellId = string & { readonly __brand: "cell-id" };

export type CellType = "markdown" | "code";

export interface BaseCell {
  id: CellId;
  content: string;
  cell_type: CellType;
}

export interface MarkdownCell extends BaseCell {
  cell_type: "markdown";
}

export interface CellOutput {
  text: string;
  out_number: number | null;
}

export type ExecutionState = "idle" | "pending" | "running" | "finishing";

export interface CodeCell extends BaseCell {
  cell_type: "code";
  outputs: CellOutput[];
  execution_number: number | null;
  execution_state: ExecutionState;
}

export type Cell = MarkdownCell | CodeCell;

// Type guards
export function isMarkdownCell(cell: Cell): cell is MarkdownCell {
  return cell.cell_type === "markdown";
}

export function isCodeCell(cell: Cell): cell is CodeCell {
  return cell.cell_type === "code";
}
