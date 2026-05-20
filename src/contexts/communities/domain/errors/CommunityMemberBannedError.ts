import { DomainError } from '@haskou/value-objects';

export class CommunityMemberBannedError extends DomainError {
  constructor() {
    super('Identity is banned from this community');
  }
}
