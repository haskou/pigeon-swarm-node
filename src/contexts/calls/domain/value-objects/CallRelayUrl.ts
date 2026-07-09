import { StringValueObject } from '@haskou/value-objects';

export class CallRelayUrl extends StringValueObject {
  constructor(value: string | StringValueObject) {
    super(value, 2_048);
  }
}
