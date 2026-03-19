import { PublicKey, StringValueObject } from '@haskou/value-objects';

// TODO: Test
export class IdentityId extends PublicKey {
  private static addPEMHeaders(publicKey: string): string {
    const formattedKey = IdentityId.removePEMHeaders(publicKey);

    return `-----BEGIN PUBLIC KEY-----\n${formattedKey}\n-----END PUBLIC KEY-----\n`;
  }

  private static removePEMHeaders(pem: string): string {
    return pem
      .replace(/-----BEGIN\s+PUBLIC\s+KEY-----/g, '')
      .replace(/-----END\s+PUBLIC\s+KEY-----/g, '')
      .replace(/\s/g, '');
  }

  constructor(value: string | StringValueObject) {
    super(IdentityId.addPEMHeaders(value?.valueOf()));
  }

  public valueOf(): string {
    return IdentityId.removePEMHeaders(this.toString());
  }
}
