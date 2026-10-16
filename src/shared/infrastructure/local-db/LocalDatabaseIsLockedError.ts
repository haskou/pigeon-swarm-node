export default class LocalDatabaseIsLockedError extends Error {
  constructor(databasePath: string) {
    super(
      `The local database at ${databasePath} is in use by another process, such as a running node.`,
    );
  }
}
