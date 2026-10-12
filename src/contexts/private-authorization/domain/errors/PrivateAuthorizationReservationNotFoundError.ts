import { DomainError } from '@haskou/value-objects';

export class PrivateAuthorizationReservationNotFoundError extends DomainError {
  public constructor() {
    super('Private authorization reservation not found');
  }
}
