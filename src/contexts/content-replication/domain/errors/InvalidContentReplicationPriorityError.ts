import { DomainError } from '@haskou/value-objects';

export class InvalidContentReplicationPriorityError extends DomainError {
  constructor(value: string) {
    super(`Invalid content replication priority: ${value}`);
  }
}
