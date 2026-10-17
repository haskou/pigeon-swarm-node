import { PublicKey } from '@haskou/pigeon-swarm-crypto';
import { StringValueObject } from '@haskou/value-objects';

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

  /**
   * Whether this id is the one canonical encoding of a usable Ed25519 key. A
   * re-encoded alias of another key's bytes, a small-order point or an
   * off-curve point is not: nobody can sign for it as itself.
   */
  public isCanonicalKey(): boolean {
    try {
      this.toRaw();

      return true;
    } catch {
      return false;
    }
  }

  public isEqual(other: unknown): boolean {
    return other instanceof IdentityId && this.valueOf() === other.valueOf();
  }

  public isNotEqual(other: unknown): boolean {
    return !this.isEqual(other);
  }

  public valueOf(): string {
    return IdentityId.removePEMHeaders(this.toString());
  }
}
