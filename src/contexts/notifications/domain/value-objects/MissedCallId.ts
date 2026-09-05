import { UUID } from '@haskou/value-objects';

export class MissedCallId extends UUID {
  public static generate(): MissedCallId {
    return new MissedCallId(UUID.generate().valueOf());
  }
}
