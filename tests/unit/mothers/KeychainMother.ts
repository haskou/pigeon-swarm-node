import { Keychain } from '@app/contexts/keychains/domain/Keychain';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { KeyPair, PrimitiveOf, Signature, Timestamp } from '@haskou/value-objects';

export class KeychainMother {
  public ownerIdentityId: IdentityId;
  public encryptedPayload = 'encrypted-keychain-payload';
  public previousKeychainExternalIdentifier: string | undefined = undefined;
  public timestamp = new Timestamp(1773848829055);
  public version = 1;
  private keyPair: KeyPair;

  public static async create(): Promise<KeychainMother> {
    const keyPair = await KeyPair.generate();

    return new KeychainMother(keyPair);
  }

  constructor(keyPair: KeyPair) {
    this.keyPair = keyPair;
    this.ownerIdentityId = new IdentityId(keyPair.toPrimitives().publicKey);
  }

  public withVersion(version: number): this {
    this.version = version;

    return this;
  }

  public withPreviousKeychainExternalIdentifier(
    previousKeychainExternalIdentifier: string | undefined,
  ): this {
    this.previousKeychainExternalIdentifier = previousKeychainExternalIdentifier;

    return this;
  }

  private unsignedPrimitives(): Omit<PrimitiveOf<Keychain>, 'signature'> {
    return {
      encryptedPayload: this.encryptedPayload,
      ownerIdentityId: this.ownerIdentityId.valueOf(),
      previousKeychainExternalIdentifier:
        this.previousKeychainExternalIdentifier,
      timestamp: this.timestamp.valueOf(),
      version: this.version,
    };
  }

  public signature(): Signature {
    return this.keyPair.sign(JSON.stringify(this.unsignedPrimitives()));
  }

  public primitives(): PrimitiveOf<Keychain> {
    return {
      ...this.unsignedPrimitives(),
      signature: this.signature().valueOf(),
    };
  }

  public build(): Keychain {
    return Keychain.fromPrimitives(this.primitives());
  }
}
