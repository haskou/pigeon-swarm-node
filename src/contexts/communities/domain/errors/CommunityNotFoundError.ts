import { DomainError } from '@haskou/value-objects';

export class CommunityNotFoundError extends DomainError {
  constructor() {
    super('Community not found');
  }
}
