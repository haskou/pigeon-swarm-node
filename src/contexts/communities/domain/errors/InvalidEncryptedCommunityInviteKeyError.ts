import { DomainError } from '@haskou/value-objects';

export class InvalidEncryptedCommunityInviteKeyError extends DomainError {
  constructor(message: string = 'Invalid encrypted community invite key') {
    super(message);
  }
}
