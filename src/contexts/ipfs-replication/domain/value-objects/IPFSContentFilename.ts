import { StringValueObject } from '@haskou/value-objects';

export class IPFSContentFilename extends StringValueObject {
  constructor(value: string | StringValueObject) {
    super(value, 255);
  }
}
