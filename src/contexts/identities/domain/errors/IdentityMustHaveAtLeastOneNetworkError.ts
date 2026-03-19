import { DomainError } from '@haskou/value-objects';

export class IdentityMustHaveAtLeastOneNetworkError extends DomainError {
  constructor() {
    super('Identity must be associated with at least one network.');
  }
}
