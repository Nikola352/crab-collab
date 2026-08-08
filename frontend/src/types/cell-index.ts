import { newIndexBetween } from "../wasm/crdt/crdt";

export type CellIndex = string & { readonly __brand: "cell-index" };

export function indexBetween(
  left?: CellIndex,
  right?: CellIndex,
): CellIndex {
  return newIndexBetween(left, right) as CellIndex;
}
