import { PrimitiveOf } from '@haskou/value-objects';

import { NetworkName } from './value-objects/NetworkName';
import { NetworkType } from './value-objects/NetworkType';

export class Network {
  public static fromPrimitives(primitives: PrimitiveOf<Network>): Network {
    return new Network(
      new NetworkName(primitives.name),
      new NetworkType(primitives.type),
    );
  }

  constructor(
    public readonly name: NetworkName,
    public readonly type: NetworkType,
  ) {}

  public toPrimitives() {
    return {
      name: this.name.valueOf(),
      type: this.type.valueOf(),
    };
  }
}
