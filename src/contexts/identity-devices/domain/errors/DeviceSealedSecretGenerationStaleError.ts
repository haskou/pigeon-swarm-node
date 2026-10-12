import { DomainError } from '@haskou/value-objects';

export class DeviceSealedSecretGenerationStaleError extends DomainError {
  public constructor() {
    super(
      'Device sealed secret generation does not advance the stored bundle.',
    );
  }
}
