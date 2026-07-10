import { StringValueObject } from '@haskou/value-objects';

export class CallMediaConnectionProtocol extends StringValueObject {
  constructor(value: string | StringValueObject) {
    super(value, 16);
  }
}
