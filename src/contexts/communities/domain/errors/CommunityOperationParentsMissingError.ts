import { DomainError } from '@haskou/value-objects';

export class CommunityOperationParentsMissingError extends DomainError {
  constructor() {
    super('Community operation parents have not arrived');
  }
}
