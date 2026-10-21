/**
 * Orders strings by UTF-16 code unit, the same order as `Array#sort()` without
 * a comparator. Anything that picks, folds, hashes or serializes shared state
 * MUST use this: locale collation (`localeCompare`, `Intl.Collator`) depends on
 * the node's ICU data and would let nodes disagree.
 */
export function compareCodeUnits(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}
