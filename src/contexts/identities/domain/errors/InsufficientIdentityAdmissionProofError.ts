import { BaseError } from '@haskou/ddd-kernel/domain';

export class InsufficientIdentityAdmissionProofError extends BaseError {
  constructor(public readonly requiredDifficultyBits: number) {
    super(
      `Identity admission needs an admissionNonce with ${requiredDifficultyBits} leading zero bits while the network is busy on this node.`,
    );
  }
}
