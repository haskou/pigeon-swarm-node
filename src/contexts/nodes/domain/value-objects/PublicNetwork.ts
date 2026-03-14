import { assert } from '@haskou/value-objects';

import { Network } from '../Network';
import { NetworkName } from './NetworkName';
import { NetworkType } from './NetworkType';

export class PublicNetwork extends Network {
  constructor(name: NetworkName, type: NetworkType) {
    super(name, type);
    assert(
      type.isEqual(NetworkType.PUBLIC),
      // TODO: Create error
      'PublicNetwork must have type public',
    );
  }
}
