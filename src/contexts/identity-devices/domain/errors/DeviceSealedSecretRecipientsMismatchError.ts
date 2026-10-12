import { DomainError } from '@haskou/value-objects';

export class DeviceSealedSecretRecipientsMismatchError extends DomainError {
  public constructor() {
    super(
      'Device sealed secret recipients do not match the authorized devices.',
    );
  }
}
