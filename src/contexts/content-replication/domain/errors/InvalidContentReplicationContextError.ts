import { DomainError } from '@haskou/value-objects';

export class InvalidContentReplicationContextError extends DomainError {
  constructor(value: string) {
    super(`Invalid content replication context: ${value}`);
  }
}
