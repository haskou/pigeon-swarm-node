import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import AggregateRoot from '@app/shared/domain/AggregateRoot';
import {
  PrimitiveOf,
  PublicKey,
  Signature,
  Timestamp,
} from '@haskou/value-objects';

import { KeychainWasPublishedEvent } from './events/KeychainWasPublishedEvent';
import { EncryptedKeychainPayload } from './value-objects/EncryptedKeychainPayload';
import { KeychainExternalIdentifier } from './value-objects/KeychainExternalIdentifier';
import { KeychainVersion } from './value-objects/KeychainVersion';

type PreviousReference = KeychainExternalIdentifier;
export type KeychainSignaturePayload = Omit<PrimitiveOf<Keychain>, 'signature'>;

export class Keychain extends AggregateRoot {
  public static fromPrimitives(primitives: PrimitiveOf<Keychain>): Keychain {
    return new Keychain(
      new IdentityId(primitives.ownerIdentityId),
      new EncryptedKeychainPayload(primitives.encryptedPayload),
      new Timestamp(primitives.timestamp),
      new Signature(primitives.signature),
      new KeychainVersion(primitives.version),
      primitives.previousKeychainExternalIdentifier
        ? new KeychainExternalIdentifier(
            primitives.previousKeychainExternalIdentifier,
          )
        : undefined,
    );
  }

  public static publish(primitives: PrimitiveOf<Keychain>): Keychain {
    const keychain = Keychain.fromPrimitives(primitives);

    keychain.record(new KeychainWasPublishedEvent(primitives.ownerIdentityId));

    return keychain;
  }

  constructor(
    private readonly ownerIdentityId: IdentityId,
    private readonly encryptedPayload: EncryptedKeychainPayload,
    private readonly timestamp: Timestamp,
    private readonly signature: Signature,
    private readonly version: KeychainVersion,
    private readonly previousKeychainExternalIdentifier?: PreviousReference,
  ) {
    super();
  }

  public toPrimitives() {
    return {
      encryptedPayload: this.encryptedPayload.valueOf(),
      ownerIdentityId: this.ownerIdentityId.valueOf(),
      previousKeychainExternalIdentifier:
        this.previousKeychainExternalIdentifier?.valueOf(),
      signature: this.signature.valueOf(),
      timestamp: this.timestamp.valueOf(),
      version: this.version.valueOf(),
    };
  }

  public belongsTo(ownerIdentityId: IdentityId): boolean {
    return this.ownerIdentityId.isEqual(ownerIdentityId);
  }

  public getPreviousKeychainExternalIdentifier():
    | KeychainExternalIdentifier
    | undefined {
    return this.previousKeychainExternalIdentifier;
  }

  public getSignature(): Signature {
    return this.signature;
  }

  public getSignaturePayload(): KeychainSignaturePayload {
    return {
      encryptedPayload: this.encryptedPayload.valueOf(),
      ownerIdentityId: this.ownerIdentityId.valueOf(),
      previousKeychainExternalIdentifier:
        this.previousKeychainExternalIdentifier?.valueOf(),
      timestamp: this.timestamp.valueOf(),
      version: this.version.valueOf(),
    };
  }

  public getOwnerPublicKey(): PublicKey {
    return PublicKey.fromPEM(this.ownerIdentityId.toString());
  }

  public isFirstVersion(): boolean {
    return this.version.isFirst();
  }

  public isNextVersionAfter(previous: Keychain): boolean {
    return (
      previous.belongsTo(this.ownerIdentityId) &&
      this.version.isNextAfter(previous.version)
    );
  }
}
