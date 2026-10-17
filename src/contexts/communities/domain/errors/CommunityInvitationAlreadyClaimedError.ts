import { DomainError } from '@haskou/value-objects';

/** The identity already claimed this invitation: a claim is written once. */
export class CommunityInvitationAlreadyClaimedError extends DomainError {
  constructor() {
    super('Community invitation already claimed');
  }
}
