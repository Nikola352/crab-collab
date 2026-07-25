/*
  Monaco/textarea offsets are UTF-16 code units; the OT wire protocol (crates/ot) counts Unicode codepoints.
  The two diverge for any character requiring a UTF-16 surrogate pair (e.g. emoji).
  `Array.from`/`[...str]` iterates a string by codepoint per the JS string iterator protocol, keeping surrogate pairs together.
*/

export function utf16ToCodepointOffset(
  text: string,
  utf16Offset: number,
): number {
  return Array.from(text.slice(0, utf16Offset)).length;
}

export function codepointToUtf16Offset(
  text: string,
  codepointOffset: number,
): number {
  return Array.from(text).slice(0, codepointOffset).join("").length;
}
