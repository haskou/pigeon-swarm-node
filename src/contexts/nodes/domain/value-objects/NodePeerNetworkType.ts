import { assert, StringValueObject } from '@haskou/value-objects';

import { InvalidNodePeerNetworkTypeError } from '../errors/InvalidNodePeerNetworkTypeError';

export class NodePeerNetworkType extends StringValueObject {
  public static readonly PRIVATE = 'private';
  public static readonly PUBLIC = 'public';

  constructor(value: string | StringValueObject) {
    super(value);

    assert(
      [NodePeerNetworkType.PRIVATE, NodePeerNetworkType.PUBLIC].includes(
        this.valueOf(),
      ),
      new InvalidNodePeerNetworkTypeError(this.valueOf()),
    );
  }

  public isPrivate(): boolean {
    return this.valueOf() === NodePeerNetworkType.PRIVATE;
  }

  public isPublic(): boolean {
    return this.valueOf() === NodePeerNetworkType.PUBLIC;
  }
}
