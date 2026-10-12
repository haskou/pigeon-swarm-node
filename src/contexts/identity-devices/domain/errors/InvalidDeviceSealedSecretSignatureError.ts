import { DomainError } from '@haskou/value-objects';

export class InvalidDeviceSealedSecretSignatureError extends DomainError {
  public constructor() {
    super('Device sealed secret entry signature is invalid.');
  }
}
