import { DomainError } from '@haskou/value-objects';

export class CommunityOwnerMismatchError extends DomainError {
  constructor() {
    super('Only the community owner can perform this action');
  }
}
