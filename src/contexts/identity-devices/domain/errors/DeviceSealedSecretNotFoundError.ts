import { DomainError } from '@haskou/value-objects';

export class DeviceSealedSecretNotFoundError extends DomainError {
  public constructor() {
    super('Device sealed secret not found.');
  }
}
