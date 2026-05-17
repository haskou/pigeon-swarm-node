import { DomainError } from '@haskou/value-objects';

export class CommunityRequestNotFoundError extends DomainError {
  constructor() {
    super('Community membership request not found');
  }
}
