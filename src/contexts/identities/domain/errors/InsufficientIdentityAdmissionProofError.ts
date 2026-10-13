import { BaseError } from '@haskou/ddd-kernel/domain';

export class InsufficientIdentityAdmissionProofError extends BaseError {
  constructor(public readonly requiredDifficultyBits: number) {
    super(
      `Identity admission needs an admissionNonce with ${requiredDifficultyBits} leading zero bits on this node now: the network is busy or the identity timestamp is outside the freshness horizon.`,
    );
  }
}
