import { DomainError } from '@haskou/value-objects';

export class CommunityOwnerCannotLeaveError extends DomainError {
  constructor() {
    super('Community owner cannot leave the community');
  }
}
