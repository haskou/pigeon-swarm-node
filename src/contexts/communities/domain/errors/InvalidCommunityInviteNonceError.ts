import { DomainError } from '@haskou/value-objects';

export class InvalidCommunityInviteNonceError extends DomainError {
  constructor() {
    super('Community invite nonce must have at least 16 characters');
  }
}
