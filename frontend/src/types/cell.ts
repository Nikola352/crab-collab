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

export interface CodeCell extends BaseCell {
  cell_type: "code";
  outputs: string[];
  execution_number: number | null;
}

export type Cell = MarkdownCell | CodeCell;

// Type guards
export function isMarkdownCell(cell: Cell): cell is MarkdownCell {
  return cell.cell_type === "markdown";
}

export function isCodeCell(cell: Cell): cell is CodeCell {
  return cell.cell_type === "code";
}
