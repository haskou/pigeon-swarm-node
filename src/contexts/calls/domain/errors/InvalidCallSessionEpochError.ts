export class InvalidCallSessionEpochError extends Error {
  constructor() {
    super('Call session epoch must be a positive safe integer.');
  }
}
