import { assert } from '@haskou/value-objects';

import { Network } from '../Network';
import { NetworkKey } from './NetworkKey';
import { NetworkName } from './NetworkName';
import { NetworkType } from './NetworkType';

export class PrivateNetwork extends Network {
  constructor(
    name: NetworkName,
    type: NetworkType,
    public readonly key: NetworkKey,
  ) {
    super(name, type);
    assert(
      type.isEqual(NetworkType.PRIVATE),
      // TODO: Create error
      'PrivateNetwork must have type private',
    );
  }
}
