import { DomainError } from '@haskou/value-objects';

export class CommunityInviteUsesExceededError extends DomainError {
  constructor() {
    super('Community invite maximum uses exceeded');
  }
}
