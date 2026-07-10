export class InvalidCallSignalDeliveryAttemptError extends Error {
  constructor() {
    super('Call signal delivery attempt is outside the retry policy.');
  }
}
