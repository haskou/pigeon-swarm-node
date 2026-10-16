export class InvalidCallTurnSharedSecretError extends Error {
  constructor(maxLength: number) {
    super(
      `CALLS_TURN_SHARED_SECRET must be well-formed text of at most ${maxLength} UTF-16 code units.`,
    );
    this.name = 'InvalidCallTurnSharedSecretError';
  }
}
