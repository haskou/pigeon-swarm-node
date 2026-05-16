import { DomainError } from '@haskou/value-objects';

export class InvalidCommunityInviteMaxUsesError extends DomainError {
  constructor() {
    super('Community invite max uses must be greater than 0');
  }
}
