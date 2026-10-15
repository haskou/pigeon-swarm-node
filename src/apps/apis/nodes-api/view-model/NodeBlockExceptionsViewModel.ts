import { NodeBlockEntries } from '@app/contexts/nodes/domain/NodeBlockEntries';

import { NodeBlockExceptionsResource } from '../resources/NodeBlockExceptionsResource';

export class NodeBlockExceptionsViewModel {
  constructor(private readonly exceptions: NodeBlockEntries) {}

  public toResource(): NodeBlockExceptionsResource {
    return this.exceptions.toPrimitives();
  }
}
