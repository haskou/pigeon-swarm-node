import { assert, Integer } from '@haskou/value-objects';

import { InvalidNodeBlockListVersionError } from '../errors/InvalidNodeBlockListVersionError';
import { NodeBlockListVersion } from './NodeBlockListVersion';

/**
 * The highest list version this node ever accepted from a publisher, 0 when
 * none. It outlives removing the source, so a removed and re-added source
 * cannot be fed an older signed list again.
 */
export class NodeBlockSourceVersionFloor extends Integer {
  constructor(value: number | Integer) {
    super(value);

    assert(
      Number.isSafeInteger(this.valueOf()) && this.isGreaterOrEqualThan(0),
      new InvalidNodeBlockListVersionError(),
    );
  }

  public admits(version: NodeBlockListVersion): boolean {
    return version.isGreaterThan(this);
  }
}
