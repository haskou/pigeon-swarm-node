import { DomainError } from '@haskou/value-objects';

export class PrivateAuthorizationReceiptNotFoundError extends DomainError {
  public constructor() {
    super('Private authorization receipt not found');
  }
}
