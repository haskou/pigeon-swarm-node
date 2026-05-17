import { DomainError } from '@haskou/value-objects';

export class CommunityRequestAlreadyResolvedError extends DomainError {
  constructor() {
    super('Community membership request is already resolved');
  }
}
