import { PrimitiveOf } from '@haskou/value-objects';

import { NetworkKey } from './value-objects/NetworkKey';
import { NetworkName } from './value-objects/NetworkName';

export class Network {
  public static fromPrimitives(primitives: PrimitiveOf<Network>): Network {
    return new Network(
      new NetworkName(primitives.name),
      primitives.key ? new NetworkKey(primitives.key) : undefined,
    );
  }

  constructor(
    private readonly name: NetworkName,
    private readonly key?: NetworkKey,
  ) {}

  public getName(): NetworkName {
    return this.name;
  }

  public toPrimitives() {
    return {
      key: this.key?.valueOf(),
      name: this.name.valueOf(),
    };
  }
}
