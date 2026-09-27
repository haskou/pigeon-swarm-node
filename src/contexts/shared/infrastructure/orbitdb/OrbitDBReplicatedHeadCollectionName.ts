import { assert, StringValueObject } from '@haskou/value-objects';

export class OrbitDBReplicatedHeadCollectionName extends StringValueObject {
  private static readonly MAX_LENGTH = 64;

  constructor(value: string | StringValueObject) {
    super(value, OrbitDBReplicatedHeadCollectionName.MAX_LENGTH);

    assert(
      /^[A-Za-z][A-Za-z0-9]*$/.test(this.value),
      new TypeError('Invalid replicated head collection name'),
    );
  }
}
