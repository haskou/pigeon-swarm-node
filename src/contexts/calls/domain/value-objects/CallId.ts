import { UUID } from '@haskou/value-objects';

export class CallId extends UUID {
  public static generate(): CallId {
    return new CallId(UUID.generate().valueOf());
  }
}
