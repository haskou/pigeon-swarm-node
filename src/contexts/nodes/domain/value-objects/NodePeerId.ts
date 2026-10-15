import { assert, StringValueObject } from '@haskou/value-objects';

import { InvalidNodePeerIdError } from '../errors/InvalidNodePeerIdError';

/** A node's libp2p peer id in its base58btc string form, as `GET /peers` shows it. */
export class NodePeerId extends StringValueObject {
  private static readonly PATTERN = /^[1-9A-HJ-NP-Za-km-z]{46,64}$/;

  constructor(value: string | StringValueObject) {
    super(value);

    assert(
      NodePeerId.PATTERN.test(this.valueOf()),
      new InvalidNodePeerIdError(),
    );
  }
}
