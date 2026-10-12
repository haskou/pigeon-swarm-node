import { DomainError } from '@haskou/value-objects';

export class InvalidDeviceSealedSecretBundleError extends DomainError {
  public constructor(reason: string) {
    super(`Invalid device sealed secret bundle: ${reason}.`);
  }
}
