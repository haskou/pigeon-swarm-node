import { DomainError } from '@haskou/value-objects';

/** The invitation is not live, or does not admit this identity now. */
export class CommunityInvitationUnusableError extends DomainError {
  constructor() {
    super('Community invitation cannot be used');
  }
}
