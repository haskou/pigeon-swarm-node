import { UUID } from '@haskou/value-objects';

export class PairingId extends UUID {
  public static generate(): PairingId {
    return new PairingId(UUID.generate().valueOf());
  }
}
