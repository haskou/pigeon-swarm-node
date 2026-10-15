import { assert, Integer } from '@haskou/value-objects';

import { InvalidNodeBlockListVersionError } from '../errors/InvalidNodeBlockListVersionError';

export class NodeBlockListVersion extends Integer {
  constructor(value: number | Integer) {
    super(value);

    assert(
      Number.isSafeInteger(this.valueOf()) && this.isGreaterOrEqualThan(1),
      new InvalidNodeBlockListVersionError(),
    );
  }

  public isNewerThan(version: NodeBlockListVersion): boolean {
    return this.isGreaterThan(version);
  }
}
