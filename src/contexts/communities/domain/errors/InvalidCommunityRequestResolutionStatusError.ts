import { DomainError } from '@haskou/value-objects';

export class InvalidCommunityRequestResolutionStatusError extends DomainError {
  constructor() {
    super(
      'Community membership request resolution status must be accepted or declined',
    );
  }
}
