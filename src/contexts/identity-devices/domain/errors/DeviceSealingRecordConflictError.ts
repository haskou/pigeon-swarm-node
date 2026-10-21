import { DomainError } from '@haskou/value-objects';

export class DeviceSealingRecordConflictError extends DomainError {
  public constructor() {
    super(
      'Device sealing record conflicts with the sealing key already recorded for this device and day.',
    );
  }
}
