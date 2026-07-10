export class InvalidCallParticipantMediaConnectionError extends Error {
  constructor() {
    super('Call media connections must target another call participant once.');
  }
}
