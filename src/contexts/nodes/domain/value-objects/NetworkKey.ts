import { PrivateKey, StringValueObject } from '@haskou/value-objects';

export class NetworkKey extends PrivateKey {
  private static normalize(value: string | StringValueObject): string {
    const pem = value.valueOf();

    return pem.endsWith('\n') ? pem : `${pem}\n`;
  }

  constructor(value: string | StringValueObject) {
    super(NetworkKey.normalize(value));
  }
}
