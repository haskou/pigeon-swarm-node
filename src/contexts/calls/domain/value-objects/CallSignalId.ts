import { UUID } from '@haskou/value-objects';

export class CallSignalId extends UUID {
  public static generate(): CallSignalId {
    return new CallSignalId(UUID.generate().valueOf());
  }
}
