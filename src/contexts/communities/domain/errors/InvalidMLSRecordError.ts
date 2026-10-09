import { DomainError } from '@haskou/value-objects';

export class InvalidMLSRecordError extends DomainError {
  constructor() {
    super('The MLS record is invalid');
  }
}
