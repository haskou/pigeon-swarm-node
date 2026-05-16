import { DomainError } from '@haskou/value-objects';

export class CommunityInviteExpiredError extends DomainError {
  constructor() {
    super('Community invite has expired');
  }
}
