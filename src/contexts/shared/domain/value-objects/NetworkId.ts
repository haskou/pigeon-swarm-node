import { UUID } from '@haskou/value-objects';

export class NetworkId extends UUID {
  public static generate(): NetworkId {
    return new NetworkId(UUID.generate().valueOf());
  }
}
