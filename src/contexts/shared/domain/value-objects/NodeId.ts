import { UUID } from '@haskou/value-objects';

export class NodeId extends UUID {
  public static generate(): NodeId {
    return new NodeId(UUID.generate().valueOf());
  }
}
