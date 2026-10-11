import { BaseError } from '@haskou/ddd-kernel/domain';

export class MailboxCreationProofInvalidError extends BaseError {
  constructor(public readonly requiredDifficultyBits: number) {
    super(
      `Mailbox creation needs a creationNonce with ${requiredDifficultyBits} leading zero bits.`,
    );
  }
}
