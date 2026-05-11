import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { PrimitiveOf } from '@haskou/value-objects';

import { NetworkName } from './value-objects/NetworkName';

export class NodePeerNetwork {
  public static fromPrimitives(
    primitives: PrimitiveOf<NodePeerNetwork>,
  ): NodePeerNetwork {
    return new NodePeerNetwork(
      new NetworkId(primitives.id),
      new NetworkName(primitives.name),
    );
  }

  constructor(
    private readonly id: NetworkId,
    private readonly name: NetworkName,
  ) {}

  public toPrimitives() {
    return {
      id: this.id.valueOf(),
      name: this.name.valueOf(),
    };
  }
}
