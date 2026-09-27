import { DomainError } from '@haskou/value-objects';

export class InvalidDeviceAuthorizationTransitionError extends DomainError {
  public constructor() {
    super('The device authorization transition is invalid.');
  }
}
