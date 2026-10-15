import { UUID } from '@haskou/value-objects';

export class NodeRegistrationCodeId extends UUID {
  public static generate(): NodeRegistrationCodeId {
    return new NodeRegistrationCodeId(UUID.generate().valueOf());
  }
}
