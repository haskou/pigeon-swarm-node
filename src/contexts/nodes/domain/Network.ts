import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { PrimitiveOf } from '@haskou/value-objects';

import { NetworkKey } from './value-objects/NetworkKey';
import { NetworkName } from './value-objects/NetworkName';

export class Network {
  public static fromPrimitives(primitives: PrimitiveOf<Network>): Network {
    return new Network(
      new NetworkId(primitives.id),
      new NetworkName(primitives.name),
      primitives.key ? new NetworkKey(primitives.key) : undefined,
    );
  }

  constructor(
    private readonly id: NetworkId,
    private readonly name: NetworkName,
    private readonly key?: NetworkKey,
  ) {}

  public getId(): NetworkId {
    return this.id;
  }

  public isPublic(): boolean {
    return this.key === undefined;
  }

  public getName(): NetworkName {
    return this.name;
  }

  public toPrimitives() {
    return {
      id: this.id.valueOf(),
      key: this.key?.valueOf(),
      name: this.name.valueOf(),
    };
  }
}
