export class CallSignalRecipientMismatchError extends Error {
  constructor() {
    super('Only the intended call signal recipient can acknowledge delivery.');
  }
}
