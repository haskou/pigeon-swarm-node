import { Timestamp } from '@haskou/value-objects';

export class PairingExpiration extends Timestamp {
  public isExpiredAt(timestamp: Timestamp): boolean {
    return this.isBefore(timestamp);
  }
}
