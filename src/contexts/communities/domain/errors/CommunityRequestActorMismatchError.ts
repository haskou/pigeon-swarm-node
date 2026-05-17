import { DomainError } from '@haskou/value-objects';

export class CommunityRequestActorMismatchError extends DomainError {
  constructor() {
    super('Identity cannot resolve this community membership request');
  }
}
