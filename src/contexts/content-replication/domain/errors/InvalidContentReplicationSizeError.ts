import { DomainError } from '@haskou/value-objects';

export class InvalidContentReplicationSizeError extends DomainError {
  constructor(value: number) {
    super(`Invalid content replication size: ${value}`);
  }
}
