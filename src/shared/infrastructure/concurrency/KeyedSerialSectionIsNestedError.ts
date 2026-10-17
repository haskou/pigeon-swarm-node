/**
 * An action was run on a `KeyedSerialQueue` key from inside an open action on
 * the same key, which would wait on itself forever.
 */
export default class KeyedSerialSectionIsNestedError extends Error {
  constructor() {
    super('A serial section cannot be entered again from inside itself.');
  }
}
