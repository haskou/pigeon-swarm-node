export default class InvalidMessageBusAdapterError extends Error {
  constructor(dsn: string) {
    super(`Missing adapter for dsn: ${dsn}`);
  }
}
