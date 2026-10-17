import { DomainError } from '@haskou/value-objects';

export class CommunityInvitationNotFoundError extends DomainError {
  constructor() {
    super('Community invitation not found');
  }
}
