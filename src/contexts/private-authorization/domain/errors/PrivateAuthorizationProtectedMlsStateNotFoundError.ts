import { DomainError } from '@haskou/value-objects';

export class PrivateAuthorizationProtectedMlsStateNotFoundError extends DomainError {
  public constructor() {
    super('Private authorization protected MLS state not found');
  }
}
