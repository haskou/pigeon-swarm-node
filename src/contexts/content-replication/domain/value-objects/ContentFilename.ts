import { StringValueObject } from '@haskou/value-objects';

export class ContentFilename extends StringValueObject {
  constructor(value: string | StringValueObject) {
    super(value, 255);
  }
}
