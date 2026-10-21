import { DomainError } from '@haskou/value-objects';

export class DeviceAuthorizationGenesisConflictError extends DomainError {
  public constructor() {
    super(
      'The identity already has a different genesis device authorization; it is never replaced.',
    );
  }
}
