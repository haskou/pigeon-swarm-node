import { DomainError } from '@haskou/value-objects';

export class InvalidNodeRelayPortRangeError extends DomainError {
  constructor(start: number, end: number) {
    super(`Node relay port range ${start}-${end} is not valid.`);
  }
}
