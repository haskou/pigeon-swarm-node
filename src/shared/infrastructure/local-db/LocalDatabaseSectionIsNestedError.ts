/**
 * An exclusive section of the local database was entered from inside a
 * section of the same scope, which would wait on itself forever.
 */
export default class LocalDatabaseSectionIsNestedError extends Error {
  constructor() {
    super(
      'A local database section cannot be entered again from inside itself.',
    );
  }
}
