import { DomainError } from '@haskou/value-objects';

export class DeviceAuthorizationNotFoundError extends DomainError {
  public constructor() {
    super('Device authorization checkpoint not found.');
  }
}
