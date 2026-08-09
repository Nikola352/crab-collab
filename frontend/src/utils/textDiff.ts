import { TextOperation } from "../wasm/ot/ot";

export function computeDiff(oldStr: string, newStr: string): TextOperation {
  // Diff by Unicode codepoint, not UTF-16 code unit
  const oldChars = Array.from(oldStr);
  const newChars = Array.from(newStr);

  let prefixLen = 0;
  while (
    prefixLen < oldChars.length &&
    prefixLen < newChars.length &&
    oldChars[prefixLen] === newChars[prefixLen]
  ) {
    prefixLen++;
  }

  let suffixLen = 0;
  while (
    suffixLen < oldChars.length - prefixLen &&
    suffixLen < newChars.length - prefixLen &&
    oldChars[oldChars.length - 1 - suffixLen] ===
      newChars[newChars.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  const operation = TextOperation.default();
  if (prefixLen > 0) {
    operation.retain(prefixLen);
  }
  if (prefixLen + suffixLen < oldChars.length) {
    operation.delete(oldChars.length - (prefixLen + suffixLen));
  }
  if (prefixLen + suffixLen < newChars.length) {
    operation.insert(
      newChars.slice(prefixLen, newChars.length - suffixLen).join(""),
    );
  }
  if (suffixLen > 0) {
    operation.retain(suffixLen);
  }

  return operation;
}
