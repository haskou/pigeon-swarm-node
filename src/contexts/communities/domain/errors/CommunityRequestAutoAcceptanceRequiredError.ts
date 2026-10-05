import { DomainError } from '@haskou/value-objects';

export class CommunityRequestAutoAcceptanceRequiredError extends DomainError {
  constructor() {
    super(
      'Auto-join communities require acceptedAt and acceptedMutation signed by the requester',
    );
  }
}
