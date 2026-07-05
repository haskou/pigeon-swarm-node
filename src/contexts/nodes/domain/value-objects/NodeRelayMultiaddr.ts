import { assert, StringValueObject } from '@haskou/value-objects';

import { InvalidNodeRelayMultiaddrError } from '../errors/InvalidNodeRelayMultiaddrError';

export class NodeRelayMultiaddr extends StringValueObject {
  constructor(value: string | StringValueObject) {
    super(value);

    assert(this.isValid(), new InvalidNodeRelayMultiaddrError(this.valueOf()));
  }

  private isValid(): boolean {
    return this.valueOf().startsWith('/') && !/\s/.test(this.valueOf());
  }
}
