import { StringValueObject } from '@haskou/value-objects';

export class IPFSContentType extends StringValueObject {
  public static readonly DEFAULT = new IPFSContentType(
    'application/octet-stream',
  );

  constructor(value: string | StringValueObject) {
    super(value, 255);
  }
}
