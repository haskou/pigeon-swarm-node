import { DomainError } from '@haskou/value-objects';

export class CommunityInviteNotFoundError extends DomainError {
  constructor() {
    super('Community invite not found');
  }
}
