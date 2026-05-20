import { DomainError } from '@haskou/value-objects';

export class CommunityOwnerCannotBeKickedError extends DomainError {
  constructor() {
    super('Community owner cannot be kicked from the community');
  }
}
