import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { PrimitiveOf, Signature, Timestamp } from '@haskou/value-objects';

import { Keychain } from '../../../domain/Keychain';
import { EncryptedKeychainPayload } from '../../../domain/value-objects/EncryptedKeychainPayload';
import { KeychainExternalIdentifier } from '../../../domain/value-objects/KeychainExternalIdentifier';
import { KeychainVersion } from '../../../domain/value-objects/KeychainVersion';

export class KeychainPublishMessage {
  public readonly encryptedPayload: EncryptedKeychainPayload;

  public readonly ownerIdentityId: IdentityId;

  public readonly previousKeychainExternalIdentifier:
    | KeychainExternalIdentifier
    | undefined;

  public readonly signature: Signature;

  public readonly timestamp: Timestamp;

  public readonly version: KeychainVersion;

  constructor(
    ownerIdentityId: string,
    encryptedPayload: string,
    timestamp: number,
    signature: string,
    version: number,
    previousKeychainExternalIdentifier?: string,
  ) {
    this.ownerIdentityId = new IdentityId(ownerIdentityId);
    this.encryptedPayload = new EncryptedKeychainPayload(encryptedPayload);
    this.timestamp = new Timestamp(timestamp);
    this.signature = new Signature(signature);
    this.version = new KeychainVersion(version);
    this.previousKeychainExternalIdentifier =
      previousKeychainExternalIdentifier === undefined
        ? undefined
        : new KeychainExternalIdentifier(previousKeychainExternalIdentifier);
  }

  public toKeychainPrimitives(): PrimitiveOf<Keychain> {
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
}
