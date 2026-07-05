import { assert, StringValueObject } from '@haskou/value-objects';

import { InvalidNodeRelayPublicHostError } from '../errors/InvalidNodeRelayPublicHostError';

export class NodeRelayPublicHost extends StringValueObject {
  constructor(value: string | StringValueObject) {
    super(value);

    assert(this.isValid(), new InvalidNodeRelayPublicHostError(this.valueOf()));
  }

  private isValid(): boolean {
    return this.valueOf().length > 0 && !/[/?#\s]/.test(this.valueOf());
  }
}
