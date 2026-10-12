import { DomainError } from '@haskou/value-objects';

export class CallSignalDeliveryNotFoundError extends DomainError {
  constructor() {
    super('Call signal delivery not found.');
  }
}
