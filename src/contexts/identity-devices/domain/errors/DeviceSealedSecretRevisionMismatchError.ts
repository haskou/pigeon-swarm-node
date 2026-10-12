import { DomainError } from '@haskou/value-objects';

export class DeviceSealedSecretRevisionMismatchError extends DomainError {
  public constructor() {
    super(
      'Device sealed secret was built for a superseded device authorization revision.',
    );
  }
}
