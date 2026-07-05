import { DomainError } from '@haskou/value-objects';

export class InvalidNodeRelayMultiaddrError extends DomainError {
  constructor(multiaddr: string) {
    super(`Node relay multiaddr "${multiaddr}" is not valid.`);
  }
}
