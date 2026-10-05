import { DomainError } from '@haskou/value-objects';

export class CommunityRequestAcceptanceOperationRequiredError extends DomainError {
  constructor() {
    super(
      'Accepting a membership request requires a signed member_joined community operation',
    );
  }
}
