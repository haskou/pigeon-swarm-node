import { DomainError } from '@haskou/value-objects';

export class CommunityChannelMessageAuthorMismatchError extends DomainError {
  constructor() {
    super('Only the author can edit the community channel message');
  }
}
