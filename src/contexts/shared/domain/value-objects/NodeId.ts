import { assert, ValueObject } from '@haskou/value-objects';

import { InvalidNodeIdError } from '../errors/InvalidNodeIdError';

export class NodeId extends ValueObject<string> {
  private static readonly BASE58_ALPHABET =
    '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

  private static readonly PATTERN =
    /^(12D3Koo[1-9A-HJ-NP-Za-km-z]{20,}|Qm[1-9A-HJ-NP-Za-km-z]{44}|bafz[a-z0-9]+)$/;

  public constructor(value: string) {
    super(value);

    assert(NodeId.PATTERN.test(value), new InvalidNodeIdError());
  }
}
