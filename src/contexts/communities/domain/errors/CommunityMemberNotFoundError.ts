import { DomainError } from '@haskou/value-objects';

export class CommunityMemberNotFoundError extends DomainError {
  constructor() {
    super('Identity is not a community member');
  }
}
