import { DomainError } from '@haskou/value-objects';

export class DeviceSealedSecretPublisherNotAuthorizedError extends DomainError {
  public constructor() {
    super('Device sealed secret publisher is not an authorized device.');
  }
}
