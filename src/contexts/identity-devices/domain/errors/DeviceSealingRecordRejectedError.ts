import { DomainError } from '@haskou/value-objects';

export class DeviceSealingRecordRejectedError extends DomainError {
  public constructor() {
    super(
      'Device sealing record was not admitted for the identity device authorization.',
    );
  }
}
